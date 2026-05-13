'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  ACCOUNT_TYPE_PRESETS,
  type TradingAccount,
  type AccountInput,
  getAccounts,
  createAccount,
} from '@/lib/tradingAccounts'

function getSupa() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const SELECTED_ACCOUNT_COOKIE = 'selected_account_id'

function readSelectedAccountCookie(): string | null {
  const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${SELECTED_ACCOUNT_COOKIE}=`))
  return match ? (match.split('=')[1] ?? null) : null
}

function writeSelectedAccountCookie(id: string) {
  document.cookie = `${SELECTED_ACCOUNT_COOKIE}=${id}; path=/trading-journal; max-age=86400; SameSite=Strict`
}

// ── Types ─────────────────────────────────────────────────────────

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

interface ViolationRow {
  ticket: string
  rule_code: string
  severity: string
  auto_note: string
}

interface UploadResult {
  tradesAdded: number
  journalPagesCreated: number
  totalParsed: number
  supabase_inserted: number
  violations_found: number
  violations_by_severity: { critical: number; warning: number }
  violations: ViolationRow[]
  trades: TradeRow[]
}

interface AccountStats {
  total_trades: number
  win_trades: number
  total_pnl: number
  violations: number
}

async function fetchAccountStats(accountId: string): Promise<AccountStats> {
  const sb = getSupa()
  const [{ data: trades }, { count: vCount }] = await Promise.all([
    sb.from('trading_history').select('profit, commission').eq('account_id', accountId),
    sb.from('rule_violations').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
  ])
  const total = trades?.length ?? 0
  const wins  = trades?.filter(t => (t.profit ?? 0) > 0).length ?? 0
  const pnl   = trades?.reduce((s, t) => s + (t.profit ?? 0) + (t.commission ?? 0), 0) ?? 0
  return { total_trades: total, win_trades: wins, total_pnl: pnl, violations: vCount ?? 0 }
}

// ── LoginGate ────────────────────────────────────────────────────

function LoginGate({ onSuccess }: { onSuccess: (pw: string) => void }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) { setError('Enter a password'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/trading-journal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        document.cookie = `journal_auth=true; path=/; max-age=86400; SameSite=Strict`
        onSuccess(password)
      } else {
        setError('Sai mật khẩu')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="mb-6">
          <h1 className="text-white text-xl font-bold">Trading Journal</h1>
          <p className="text-gray-400 text-sm mt-1">Private — enter password to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
            >
              {showPw ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-60 text-white rounded-xl py-3 text-sm font-semibold transition"
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  )
}

// ── Add Account Modal ─────────────────────────────────────────────

function AddAccountModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (account: TradingAccount) => void
}) {
  const presetKeys = Object.keys(ACCOUNT_TYPE_PRESETS)
  const defaultType = presetKeys[0] ?? 'FTMO 1-Step'
  const defaultPreset = ACCOUNT_TYPE_PRESETS[defaultType]!

  const [broker, setBroker] = useState('')
  const [accountCode, setAccountCode] = useState('')
  const [accountType, setAccountType] = useState(defaultType)
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [initialBalance, setInitialBalance] = useState('')
  const [dailyDdPct, setDailyDdPct] = useState(
    defaultPreset.daily_dd_pct != null ? String(defaultPreset.daily_dd_pct) : '',
  )
  const [totalDdPct, setTotalDdPct] = useState(
    defaultPreset.total_dd_pct != null ? String(defaultPreset.total_dd_pct) : '',
  )
  const [ddType, setDdType] = useState(defaultPreset.dd_type ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleTypeChange(type: string) {
    setAccountType(type)
    const preset = ACCOUNT_TYPE_PRESETS[type]
    if (preset) {
      setDailyDdPct(preset.daily_dd_pct != null ? String(preset.daily_dd_pct) : '')
      setTotalDdPct(preset.total_dd_pct != null ? String(preset.total_dd_pct) : '')
      setDdType(preset.dd_type ?? '')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!broker.trim() || !accountCode.trim()) {
      setError('Broker and Account Code are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const input: AccountInput = {
        broker: broker.trim(),
        account_code: accountCode.trim(),
        account_type: accountType || null,
        display_name: displayName.trim() || null,
        currency: currency.trim() || 'USD',
        initial_balance: parseFloat(initialBalance) || 0,
        current_balance: null,
        daily_dd_pct: dailyDdPct ? parseFloat(dailyDdPct) : null,
        total_dd_pct: totalDdPct ? parseFloat(totalDdPct) : null,
        dd_type: ddType || null,
        is_active: true,
      }
      const account = await createAccount(input)
      onSaved(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  const ddTypeLabel = ddType === 'trailing' ? 'Trailing' : ddType === 'static' ? 'Static' : 'None'

  const inputClass = 'w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition'
  const labelClass = 'text-xs text-gray-400 font-medium mb-1'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white font-bold text-base mb-5">Add Trading Account</h3>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelClass}>Broker *</p>
              <input
                list="broker-list"
                value={broker}
                onChange={e => setBroker(e.target.value)}
                placeholder="e.g. FTMO"
                className={inputClass}
              />
              <datalist id="broker-list">
                {['FTMO', 'Exness', 'Other'].map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <p className={labelClass}>Account Code *</p>
              <input
                value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                placeholder="e.g. 123456"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <p className={labelClass}>Account Type</p>
            <select
              value={accountType}
              onChange={e => handleTypeChange(e.target.value)}
              className={inputClass}
            >
              {presetKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div>
            <p className={labelClass}>Display Name (optional)</p>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. My FTMO Account"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelClass}>Currency</p>
              <input
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                placeholder="USD"
                className={inputClass}
              />
            </div>
            <div>
              <p className={labelClass}>Initial Balance</p>
              <input
                type="number"
                value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                placeholder="e.g. 100000"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={labelClass}>Daily DD %</p>
              <input
                type="number"
                step="0.1"
                value={dailyDdPct}
                onChange={e => setDailyDdPct(e.target.value)}
                placeholder="—"
                className={inputClass}
              />
            </div>
            <div>
              <p className={labelClass}>Total DD %</p>
              <input
                type="number"
                step="0.1"
                value={totalDdPct}
                onChange={e => setTotalDdPct(e.target.value)}
                placeholder="—"
                className={inputClass}
              />
            </div>
            <div>
              <p className={labelClass}>DD Type</p>
              <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400">
                {ddTypeLabel}
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Result Panel ─────────────────────────────────────────────────

function ResultPanel({ result }: { result: UploadResult }) {
  const [ruleNames, setRuleNames] = useState<Record<string, string>>({})
  const [showViolations, setShowViolations] = useState(false)

  const nCritical = result.violations_by_severity?.critical ?? 0
  const nWarning  = result.violations_by_severity?.warning  ?? 0

  // Fetch human-readable rule names when violations exist
  useEffect(() => {
    if (!result.violations_found) return
    getSupa()
      .from('trading_rules')
      .select('rule_code, name')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string> = {}
        for (const r of data) map[r.rule_code] = r.name
        setRuleNames(map)
      })
  }, [result])

  return (
    <div className="space-y-2">
      {/* Sync line */}
      <p className="text-sm text-gray-400">
        <span className="text-green-400 font-semibold">✓ {result.tradesAdded} trades</span>
        {' → Sheets · Notion · Supabase '}
        <span className="text-gray-600">|</span>
        {' '}
        <span className="text-gray-500">{result.totalParsed - result.tradesAdded} duplicates skipped</span>
      </p>

      {/* Violations */}
      {(result.violations_found ?? 0) === 0 ? (
        <p className="text-xs text-green-600">✓ No rule violations detected</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowViolations(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition"
          >
            <span className="text-sm font-semibold text-yellow-400">⚠ Rule Violations ({result.violations_found})</span>
            <div className="flex items-center gap-2">
              {nCritical > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-950 text-red-400">Critical: {nCritical}</span>}
              {nWarning > 0  && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-950 text-yellow-400">Warning: {nWarning}</span>}
              <span className="text-gray-600 text-xs">{showViolations ? '▲' : '▼'}</span>
            </div>
          </button>

          {showViolations && (
            <div className="border-t border-gray-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Ticket</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Rule</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Severity</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.violations.map((v, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="px-4 py-2 font-mono text-gray-300">{v.ticket}</td>
                      <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{ruleNames[v.rule_code] ?? v.rule_code}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {v.severity === 'critical'
                          ? <span className="text-red-400">🔴 Critical</span>
                          : <span className="text-yellow-400">🟡 Warning</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{v.auto_note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────

function Dashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [accountStats, setAccountStats] = useState<AccountStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedAccount = accounts.find(a => a.id === selectedId) ?? null

  // Prevent browser navigation on file drop outside drop zone
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // Load accounts on mount, restore cookie-selected account
  useEffect(() => {
    getAccounts()
      .then(accs => {
        setAccounts(accs)
        if (accs.length === 0) return
        const cookieId = readSelectedAccountCookie()
        const match = cookieId ? accs.find(a => a.id === cookieId) : null
        setSelectedId(match ? match.id : accs[0].id)
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoadingAccounts(false))
  }, [])

  // Fetch account stats whenever selected account changes
  useEffect(() => {
    if (!selectedId) { setAccountStats(null); return }
    setStatsLoading(true)
    fetchAccountStats(selectedId)
      .then(setAccountStats)
      .catch(() => setAccountStats(null))
      .finally(() => setStatsLoading(false))
  }, [selectedId])

  async function handleUpload(file: File) {
    if (!selectedId) return
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file'); return }
    setUploading(true); setError(''); setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('account_id', selectedId)

    try {
      const res = await fetch('/api/trading-journal/upload', {
        method: 'POST',
        headers: { 'x-journal-password': password },
        body: formData,
      })
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
      } else {
        setResult(data as UploadResult)
        // Refetch stats to reflect new trades/violations
        if (selectedId) fetchAccountStats(selectedId).then(setAccountStats).catch(() => {})
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  const noAccount = !selectedId

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Trading Journal</h1>
            <p className="text-gray-500 text-sm mt-0.5">Upload FTMO CSV → Sheets · Notion · Supabase</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/trading-journal/settings" className="text-gray-400 hover:text-white text-sm transition">⚙ Settings</a>
            <button onClick={onLogout} className="text-gray-500 hover:text-gray-300 text-sm transition">Logout</button>
          </div>
        </div>

        {/* Account bar */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {loadingAccounts ? (
              <span className="text-gray-500 text-sm">Loading accounts…</span>
            ) : accounts.length === 0 ? (
              <span className="text-gray-500 text-sm">No accounts yet</span>
            ) : (
              accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedId(acc.id); setResult(null); writeSelectedAccountCookie(acc.id) }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    selectedId === acc.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {acc.display_name ?? acc.account_code} · {acc.broker}
                </button>
              ))
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-800 text-indigo-400 hover:bg-gray-700 border border-indigo-800 transition"
            >
              + Add Account
            </button>
          </div>

          {/* Account info strip */}
          {selectedAccount && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-800 text-xs text-gray-400">
              {selectedAccount.account_type && (
                <span className="px-2 py-0.5 rounded bg-gray-800 text-indigo-300 font-medium">
                  {selectedAccount.account_type}
                </span>
              )}
              <span>{selectedAccount.currency} {selectedAccount.initial_balance.toLocaleString()}</span>
              {selectedAccount.daily_dd_pct != null && (
                <span className="text-yellow-500">Daily: {selectedAccount.daily_dd_pct}%</span>
              )}
              {selectedAccount.total_dd_pct != null && (
                <span className="text-orange-500">
                  Total: {selectedAccount.total_dd_pct}%
                  {selectedAccount.dd_type ? ` ${selectedAccount.dd_type}` : ''}
                </span>
              )}
            </div>
          )}

          {/* Account stats strip */}
          {selectedAccount && (
            <div className="flex flex-wrap items-center gap-0 pt-3 border-t border-gray-800 text-xs divide-x divide-gray-800">
              {statsLoading ? (
                <span className="text-gray-600 px-3">Loading stats…</span>
              ) : accountStats ? (
                <>
                  <span className="text-gray-400 px-3">Trades: <span className="text-gray-200 font-medium">{accountStats.total_trades}</span></span>
                  <span className="text-gray-400 px-3">Win Rate: <span className="text-gray-200 font-medium">
                    {accountStats.total_trades > 0 ? ((accountStats.win_trades / accountStats.total_trades) * 100).toFixed(1) : '0.0'}%
                  </span></span>
                  <span className="text-gray-400 px-3">P&amp;L: <span className={`font-semibold ${accountStats.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {accountStats.total_pnl >= 0 ? '+' : ''}${accountStats.total_pnl.toFixed(2)}
                  </span></span>
                  {accountStats.violations > 0 && (
                    <span className="text-yellow-500 px-3">⚠ Violations: <span className="font-medium">{accountStats.violations}</span></span>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={noAccount ? -1 : 0}
          onKeyDown={e => !noAccount && e.key === 'Enter' && fileRef.current?.click()}
          onDragEnter={e => { e.preventDefault(); e.stopPropagation(); if (!noAccount) setDragging(true) }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!noAccount) setDragging(true) }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragging(false) }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation(); setDragging(false)
            if (!noAccount) { const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }
          }}
          onClick={() => !noAccount && !uploading && fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-12 text-center transition select-none ${
            noAccount
              ? 'border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed'
              : dragging
              ? 'border-indigo-500 bg-indigo-500/10 cursor-pointer'
              : uploading
              ? 'border-gray-700 bg-gray-900 cursor-not-allowed'
              : 'border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/50 cursor-pointer'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
          />
          {noAccount ? (
            <p className="text-gray-500 text-sm">Select an account above to upload</p>
          ) : uploading ? (
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

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Compact result summary + violations */}
        {result && <ResultPanel result={result} />}

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
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isBuy ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
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

      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onSaved={acc => {
            setAccounts(prev => [...prev, acc])
            setSelectedId(acc.id)
            setShowAddModal(false)
          }}
        />
      )}
    </main>
  )
}

// ── Root ─────────────────────────────────────────────────────────

export default function TradingJournalPage() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')

  useEffect(() => {
    const ok = document.cookie.split(';').some(c => c.trim() === 'journal_auth=true')
    setAuthed(ok)
    setChecking(false)
  }, [])

  function handleLogout() {
    document.cookie = `journal_auth=; path=/; max-age=0`
    setAuthed(false)
    setPassword('')
  }

  if (checking) return null
  if (!authed) return <LoginGate onSuccess={pw => { setPassword(pw); setAuthed(true) }} />
  return <Dashboard password={password} onLogout={handleLogout} />
}
