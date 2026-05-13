'use client'

import { useState, useEffect, useRef } from 'react'

interface TradeRow {
  ticket: string
  type: string
  symbol: string
  openTime: string
  closeTime: string
  pips: number
  profit: number
  commission: number
}

interface UploadResult {
  tradesAdded: number
  journalPagesCreated: number
  totalParsed: number
  trades: TradeRow[]
}

export default function TradingJournalPage() {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('journal_pw')
    if (stored) {
      setPassword(stored)
      setAuthenticated(true)
    }
    setChecking(false)
  }, [])

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) { setPwError('Enter a password'); return }
    sessionStorage.setItem('journal_pw', password)
    setPwError('')
    setAuthenticated(true)
  }

  function handleLogout() {
    sessionStorage.removeItem('journal_pw')
    setAuthenticated(false)
    setPassword('')
    setResult(null)
    setError('')
  }

  async function handleUpload(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file')
      return
    }
    setUploading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    const pw = sessionStorage.getItem('journal_pw') ?? password

    try {
      const res = await fetch('/api/trading-journal/upload', {
        method: 'POST',
        headers: { 'x-journal-password': pw },
        body: formData,
      })

      if (res.status === 401) {
        handleLogout()
        setPwError('Session expired — please log in again')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
      } else {
        setResult(data as UploadResult)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  if (checking) return null

  // ── Password screen ──────────────────────────────────────────────
  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
          <div className="mb-6">
            <h1 className="text-white text-xl font-bold">Trading Journal</h1>
            <p className="text-gray-400 text-sm mt-1">Private — enter password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition"
            />
            {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl py-3 text-sm font-semibold transition"
            >
              Enter
            </button>
          </form>
        </div>
      </main>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-white text-2xl font-bold">Trading Journal</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Upload FTMO CSV → sync to Google Sheets + Notion
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            Logout
          </button>
        </div>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) handleUpload(f)
          }}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition select-none mb-6 ${
            dragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : uploading
              ? 'border-gray-700 bg-gray-900 cursor-not-allowed'
              : 'border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
              e.target.value = ''
            }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-indigo-400 text-sm font-medium">Uploading and processing…</p>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-3">📂</div>
              <p className="text-gray-200 font-semibold">Drop FTMO CSV here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Result summary */}
        {result && (
          <div className="mb-6 bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-4">Upload complete</h2>
            <div className="flex flex-wrap gap-6">
              <Stat value={result.totalParsed} label="trades parsed" color="text-gray-300" />
              <Stat value={result.tradesAdded} label="added to Google Sheets" color="text-green-400" />
              <Stat value={result.journalPagesCreated} label="journal pages created in Notion" color="text-purple-400" />
              <Stat value={result.totalParsed - result.tradesAdded} label="duplicates skipped" color="text-gray-500" />
            </div>
          </div>
        )}

        {/* Trade preview table */}
        {result && result.trades.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Parsed trades</h2>
              <span className="text-gray-500 text-sm">{result.trades.length} rows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Ticket', 'Type', 'Symbol', 'Open', 'Close', 'Pips', 'Profit', 'Commission'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => {
                    const isBuy = t.type.toLowerCase() === 'buy'
                    const isProfit = t.profit >= 0
                    return (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                        <td className="px-4 py-3 font-mono text-gray-300 text-xs">{t.ticket}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            isBuy ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
                          }`}>
                            {t.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-200 font-medium">{t.symbol}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs whitespace-nowrap">{t.openTime}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs whitespace-nowrap">{t.closeTime}</td>
                        <td className="px-4 py-3 text-gray-300">{t.pips}</td>
                        <td className={`px-4 py-3 font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{Number(t.profit).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{Number(t.commission).toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-gray-400 text-sm mt-0.5">{label}</p>
    </div>
  )
}
