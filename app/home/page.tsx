'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase'

const supabase = createClient()

const LOGO_URL = 'https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/assets/logo/gametritue-stacked-fullcolor.svg'
const AVATAR_BASE = 'https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/Avatar'

function resolveAvatar(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${AVATAR_BASE}/${url}`
}

interface PlayerData {
  username: string
  avatar_url: string | null
  avatar_bg: string | null
  total_score: number
  puzzles_done: number
  trade_count: number
}

export default function HomePage() {
  const router = useRouter()
  const [player, setPlayer] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const [{ data: p }, { data: scoresData }, { count: tradeCount }] = await Promise.all([
        supabase.from('players').select('username, avatar_url, avatar_bg, total_score').eq('id', user.id).single(),
        supabase.from('scores').select('id').eq('player_id', user.id),
        supabase.from('trading_history').select('id', { count: 'exact', head: true }).eq('account_id', user.id),
      ])

      // trading_history may use account_id from trading_accounts — try via join
      let finalTradeCount = tradeCount ?? 0
      if (finalTradeCount === 0) {
        const { data: accounts } = await supabase
          .from('trading_accounts')
          .select('id')
          .eq('owner_id', user.id)
        if (accounts && accounts.length > 0) {
          const ids = accounts.map(a => a.id)
          const { count } = await supabase
            .from('trading_history')
            .select('id', { count: 'exact', head: true })
            .in('account_id', ids)
          finalTradeCount = count ?? 0
        }
      }

      setPlayer({
        username: p?.username ?? user.email?.split('@')[0] ?? 'Bạn',
        avatar_url: p?.avatar_url ?? null,
        avatar_bg: p?.avatar_bg ?? null,
        total_score: p?.total_score ?? 0,
        puzzles_done: scoresData?.length ?? 0,
        trade_count: finalTradeCount,
      })
      setLoading(false)
    })()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#3b4bc8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const avatarSrc = resolveAvatar(player?.avatar_url)

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ color: '#131a52' }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <img src={LOGO_URL} alt="Gametritue" className="h-8 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: player?.avatar_bg ?? '#3b4bc8' }}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              : <span>{(player?.username ?? '?')[0].toUpperCase()}</span>}
          </div>
          <span className="text-sm font-medium hidden sm:block" style={{ color: '#131a52' }}>{player?.username}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-700 transition px-2 py-1 rounded hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:px-12">

        {/* Greeting */}
        <div className="text-center mb-10">
          <h1 className="font-bold mb-2" style={{ fontSize: 24, color: '#131a52' }}>
            Xin chào, {player?.username}! 👋
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>Hôm nay bạn muốn làm gì?</p>
        </div>

        {/* Feature cards */}
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Card 1 — Sudoku */}
          <div
            onClick={() => router.push('/game')}
            className="group bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            style={{
              borderTop: '3px solid #3b4bc8',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,75,200,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
          >
            <div style={{ fontSize: 48, lineHeight: 1 }}>🧩</div>
            <div>
              <h2 className="font-bold mb-1" style={{ fontSize: 20, color: '#131a52' }}>Sudoku</h2>
              <p className="text-sm" style={{ color: '#94a3b8' }}>100 puzzle · 10 level độ khó · Bảng xếp hạng toàn cầu</p>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-bold" style={{ color: '#3b4bc8' }}>{player?.puzzles_done ?? 0}</span>
                <span className="ml-1" style={{ color: '#94a3b8' }}>bài hoàn thành</span>
              </div>
              <div>
                <span className="font-bold" style={{ color: '#3b4bc8' }}>{(player?.total_score ?? 0).toLocaleString()}</span>
                <span className="ml-1" style={{ color: '#94a3b8' }}>điểm</span>
              </div>
            </div>
            <button
              className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition mt-auto"
              style={{ background: '#3b4bc8' }}
            >
              Chơi ngay →
            </button>
          </div>

          {/* Card 2 — Trading Journal */}
          <div
            onClick={() => router.push('/trading-journal')}
            className="group bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            style={{
              borderTop: '3px solid #f7941d',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(247,148,29,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
          >
            <div style={{ fontSize: 48, lineHeight: 1 }}>📊</div>
            <div>
              <h2 className="font-bold mb-1" style={{ fontSize: 20, color: '#131a52' }}>Trading Journal</h2>
              <p className="text-sm" style={{ color: '#94a3b8' }}>Theo dõi giao dịch · Phân tích vi phạm · Journal hàng ngày</p>
            </div>
            <div className="text-sm">
              <span className="font-bold" style={{ color: '#f7941d' }}>{player?.trade_count ?? 0}</span>
              <span className="ml-1" style={{ color: '#94a3b8' }}>giao dịch đã sync</span>
            </div>
            <button
              className="w-full py-2.5 rounded-full text-sm font-semibold transition mt-auto"
              style={{ color: '#3b4bc8', border: '1.5px solid #3b4bc8', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#3b4bc8'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3b4bc8' }}
            >
              Mở Journal →
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4" style={{ fontSize: 12, color: '#cbd5e1' }}>
        Gametritue · Rèn trí tuệ mỗi ngày
      </footer>
    </div>
  )
}
