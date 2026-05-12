'use client'

import { createClient } from '../lib/supabase'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SudokuGrid from '../components/SudokuGrid'
import { PUZZLES, LEVEL_NAMES, LEVEL_COLORS } from '../lib/puzzles'
import { isFixed, isSolved, calcScore, fmtTime } from '../lib/gameLogic'

const MAX_MISTAKES = 10
const TIME_LIMIT = 180 * 60

export default function GamePage() {
  const router = useRouter()
  const [player, setPlayer] = useState<any>(null)
  const [screen, setScreen] = useState<'levels' | 'puzzles' | 'game' | 'score'>('levels')
  const [level, setLevel] = useState(1)
  const [puzzleNum, setPuzzleNum] = useState(1)
  const [grid, setGrid] = useState<number[][]>([])
  const [selected, setSelected] = useState<[number,number] | null>(null)
  const [pending, setPending] = useState<[number,number,number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [autoAssist, setAutoAssist] = useState(true)
  const [highlights] = useState(new Set<string>())
  const [scores, setScores] = useState<Record<string, number>>({})
  const [lastScore, setLastScore] = useState(0)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboard, setLeaderboard] = useState<{id:string,username:string,total_score:number}[]>([])
  const [lbLoading, setLbLoading] = useState(false)

  const puzzle = PUZZLES[level]?.[puzzleNum-1]?.puzzle || []
  const solution = PUZZLES[level]?.[puzzleNum-1]?.solution || []

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('players').select('*').eq('id', user.id).single()
      setPlayer(data)
      const { data: sc } = await supabase
        .from('scores')
        .select('level, puzzle_num, score')
        .eq('player_id', user.id)
      if (sc) {
        const map: Record<string, number> = {}
        sc.forEach((s: any) => { map[`${s.level}-${s.puzzle_num}`] = s.score })
        setScores(map)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(e => {
      if (e + 1 >= TIME_LIMIT) { setRunning(false); return e + 1 }
      return e + 1
    }), 1000)
    return () => clearInterval(id)
  }, [running])

  function startGame(lv: number, pn: number) {
    const p = PUZZLES[lv]?.[pn-1]
    if (!p) return
    setLevel(lv); setPuzzleNum(pn)
    setGrid(p.puzzle.map(r => [...r]))
    setSelected(null); setPending(null)
    setMistakes(0); setElapsed(0); setRunning(true)
    setScreen('game')
  }

  async function handleInput(n: number) {
    if (!selected || !running) return
    const [r, c] = selected
    if (isFixed(puzzle, r, c)) return
    const ng = grid.map(row => [...row])
    if (n === 0) { ng[r][c] = 0; setPending(null) }
    else {
      if (ng[r][c] !== n) {
        ng[r][c] = n
        setPending([r, c, n])
        if (n !== solution[r][c]) {
          const nm = mistakes + 1
          setMistakes(nm)
          if (nm >= MAX_MISTAKES) { setRunning(false) }
        }
      }
    }
    setGrid(ng)
    if (n !== 0 && isSolved(ng, solution)) {
      setRunning(false)
      const sc = calcScore(elapsed, mistakes)
      setLastScore(sc)
      await saveScore(sc)
      setScreen('score')
    }
  }

  async function saveScore(sc: number) {
     const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const key = `${level}-${puzzleNum}`
  const isNewBest = !scores[key] || sc > scores[key]
  
  await supabase.from('scores').upsert({
    player_id: user.id,
    level, puzzle_num: puzzleNum,
    score: sc, time_seconds: elapsed, mistakes
  }, { onConflict: 'player_id,level,puzzle_num' })
  
  // Cộng coins khi hoàn thành bài lần đầu
  if (!scores[key]) {
    const coinReward = level * 10
    await supabase.from('players')
      .update({ 
        total_coins: player.total_coins + coinReward,
        total_score: (player.total_score || 0) + sc
      })
      .eq('id', user.id)
    setPlayer((p: any) => ({ 
      ...p, 
      total_coins: p.total_coins + coinReward,
      total_score: (p.total_score || 0) + sc
    }))
    await supabase.from('coin_transactions').insert({
      player_id: user.id,
      amount: coinReward,
      reason: `Hoàn thành Level ${level} Bài ${puzzleNum}`
    })
  }
  
  setScores(prev => ({ ...prev, [key]: sc }))
  }

  async function openLeaderboard() {
    setShowLeaderboard(true)
    if (leaderboard.length > 0) return
    setLbLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .select('id, username, total_score')
      .order('total_score', { ascending: false })
      .limit(20)
    setLeaderboard(data || [])
    setLbLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (screen !== 'game' || !selected || !running) return
    const [r, c] = selected
    const n = parseInt(e.key)
    if (n >= 1 && n <= 9) handleInput(n)
    else if (e.key === 'Backspace' || e.key === 'Delete') handleInput(0)
    else if (e.key === 'ArrowUp' && r > 0) { setPending(null); setSelected([r-1, c]) }
    else if (e.key === 'ArrowDown' && r < 8) { setPending(null); setSelected([r+1, c]) }
    else if (e.key === 'ArrowLeft' && c > 0) { setPending(null); setSelected([r, c-1]) }
    else if (e.key === 'ArrowRight' && c < 8) { setPending(null); setSelected([r, c+1]) }
    e.preventDefault()
  }

  if (!player) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-400">Đang tải...</p>
    </div>
  )

  // LEVEL SELECT
  if (screen === 'levels') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowLeaderboard(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">🏆 Bảng xếp hạng</h2>
              <button onClick={() => setShowLeaderboard(false)} className="text-gray-400 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {lbLoading ? (
                <p className="text-center text-gray-400 py-10 text-sm">Đang tải...</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="py-2 pl-5 text-left w-8">#</th>
                      <th className="py-2 text-left">Tên</th>
                      <th className="py-2 pr-5 text-right">Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((p, i) => {
                      const isMe = p.id === player.id
                      return (
                        <tr key={p.id}
                          className={`border-b border-gray-50 ${isMe ? 'bg-blue-50' : ''}`}>
                          <td className={`py-2.5 pl-5 font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {i + 1}
                          </td>
                          <td className={`py-2.5 ${isMe ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                            {p.username}{isMe ? ' (bạn)' : ''}
                          </td>
                          <td className="py-2.5 pr-5 text-right font-semibold text-gray-800">
                            {(p.total_score || 0).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between w-full max-w-lg mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Sudoku</h1>
        <div className="text-sm text-gray-500 flex items-center gap-3">
          <span className="font-semibold text-yellow-600">{player.total_coins} 🪙</span>
          <button onClick={openLeaderboard} className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 transition">
            <span>🏆</span>
            <span>{Object.values(scores).reduce((sum, s) => sum + s, 0)} pt</span>
          </button>
          <span className="text-gray-400">{player.username}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {Array.from({length:10},(_,i)=>i+1).map(lv => {
          const col = LEVEL_COLORS[lv]
          const done = Object.keys(scores).filter(k => k.startsWith(`${lv}-`)).length
          return (
            <button key={lv} onClick={() => { setScreen('puzzles'); setLevel(lv) }}
              className="bg-white rounded-xl p-4 text-left shadow-sm border border-gray-100 hover:shadow-md transition"
              style={{ borderTop: `3px solid ${col}` }}>
              <div className="text-xs font-semibold mb-1" style={{ color: col }}>Level {lv}</div>
              <div className="text-base font-bold text-gray-800">{LEVEL_NAMES[lv]}</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full">
                <div className="h-full rounded-full transition-all" style={{ width: `${done*10}%`, background: col }}/>
              </div>
              <div className="text-xs text-gray-400 mt-1">{done}/10 bài</div>
            </button>
          )
        })}
      </div>
    </div>
  )

  // PUZZLE SELECT
  if (screen === 'puzzles') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-sm">
        <button onClick={() => setScreen('levels')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          ← Quay lại
        </button>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Level {level}</h2>
        <p className="text-sm mb-6" style={{ color: LEVEL_COLORS[level] }}>{LEVEL_NAMES[level]}</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({length:10},(_,i)=>i+1).map(pn => {
            const sc = scores[`${level}-${pn}`]
            return (
              <button key={pn} onClick={() => startGame(level, pn)}
                className="aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-bold border transition hover:border-blue-400"
                style={{ background: sc ? `${LEVEL_COLORS[level]}18` : '#fff', borderColor: sc ? LEVEL_COLORS[level] : '#e5e7eb', color: '#1e293b' }}>
                {pn}
                {sc && <span className="text-xs font-normal" style={{ color: LEVEL_COLORS[level] }}>{sc}pt</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  // SCORE SCREEN
  if (screen === 'score') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-5xl mb-4">🏆</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Xuất sắc!</h2>
      <p className="text-sm text-gray-500 mb-6">Level {level} · Bài {puzzleNum}</p>
      <div className="bg-white rounded-2xl shadow p-8 text-center mb-6">
        <div className="text-5xl font-bold mb-1" style={{ color: LEVEL_COLORS[level] }}>{lastScore}</div>
        <div className="text-xs text-gray-400 uppercase tracking-widest mb-4">Điểm</div>
        <div className="flex gap-8 justify-center">
          <div><div className="text-xl font-bold text-gray-700">{fmtTime(elapsed)}</div><div className="text-xs text-gray-400">Thời gian</div></div>
          <div><div className="text-xl font-bold" style={{ color: mistakes > 0 ? '#dc2626' : '#16a34a' }}>{mistakes}</div><div className="text-xs text-gray-400">Lần sai</div></div>
        </div>
      </div>
      <div className="flex gap-3">
        {puzzleNum < 10 && <button onClick={() => startGame(level, puzzleNum+1)} className="px-5 py-2 rounded-lg text-white text-sm font-bold" style={{ background: LEVEL_COLORS[level] }}>Bài tiếp →</button>}
        <button onClick={() => startGame(level, puzzleNum)} className="px-5 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: LEVEL_COLORS[level], color: LEVEL_COLORS[level] }}>Chơi lại</button>
        <button onClick={() => setScreen('levels')} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-500">Menu</button>
      </div>
    </div>
  )

  // GAME SCREEN
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-3 px-2"
      onKeyDown={handleKey} tabIndex={0}>
      <div className="w-full max-w-sm flex items-center justify-between mb-2">
        <button onClick={() => { setRunning(false); setScreen('puzzles') }} className="text-sm text-gray-500">← Menu</button>
        <span className="text-sm font-bold text-gray-700">L{level} · Bài {puzzleNum}</span>
        <span className="text-xs font-bold" style={{ color: LEVEL_COLORS[level] }}>{LEVEL_NAMES[level]}</span>
      </div>

      <div className="w-full max-w-sm flex mb-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        {[
          { label: 'Đã qua', val: fmtTime(elapsed), urgent: false },
          { label: 'Còn lại', val: fmtTime(Math.max(0, TIME_LIMIT-elapsed)), urgent: (TIME_LIMIT-elapsed) < 300 },
          { label: 'Sai', val: `${mistakes}/${MAX_MISTAKES}`, urgent: mistakes > 0 },
        ].map((s, i) => (
          <div key={i} className="flex-1 py-2 text-center" style={{ borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
            <div className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</div>
            <div className="text-base font-bold" style={{ color: s.urgent ? '#dc2626' : '#1e293b' }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-sm flex justify-between items-center mb-2 px-1">
        <span className="text-xs text-gray-500">Hỗ trợ tự động</span>
        <button onClick={() => setAutoAssist(a => !a)}
          className="px-4 py-1 rounded-full text-xs font-bold transition"
          style={{ background: autoAssist ? LEVEL_COLORS[level] : '#f1f5f9', color: autoAssist ? '#fff' : '#94a3b8' }}>
          {autoAssist ? 'BẬT' : 'TẮT'}
        </button>
      </div>

      <SudokuGrid
        puzzle={puzzle} grid={grid} solution={solution}
        selected={selected} onSelect={(r,c) => { setPending(null); setSelected([r,c]) }}
        autoAssist={autoAssist} highlights={highlights} pending={pending}
      />

      <div className="flex gap-1 mt-3">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => handleInput(n)}
            className="w-8 h-10 rounded-lg border border-gray-200 bg-white font-bold text-blue-600 text-base shadow-sm hover:bg-blue-50 transition">
            {n}
          </button>
        ))}
      </div>
      <button onClick={() => handleInput(0)} className="mt-1 px-4 py-1 text-xs text-gray-400 border border-gray-200 rounded-lg bg-white">Xóa</button>
    </div>
  )
}