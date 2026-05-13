'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '../lib/supabase'
import {
  ACCOUNT_TYPE_PRESETS,
  type TradingAccount,
  type AccountInput,
  getAccounts,
  createAccount,
} from '@/lib/tradingAccounts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Auth-aware client (reads Supabase session cookies)
const authSupabase = createAuthClient()

// Test query on module load
if (typeof window !== 'undefined') {
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ).from('trading_rules').select('count').then(({ data, error }) => {
    console.log('Supabase connection test:', { data, error })
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Key prefix:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20))
  })
}

const SELECTED_ACCOUNT_COOKIE = 'selected_account_id'

function readSelectedAccountCookie(): string | null {
  const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${SELECTED_ACCOUNT_COOKIE}=`))
  return match ? (match.split('=')[1] ?? null) : null
}

function writeSelectedAccountCookie(id: string) {
  document.cookie = `${SELECTED_ACCOUNT_COOKIE}=${id}; path=/trading-journal; max-age=86400; SameSite=Strict`
}

function fmtTimestamp(iso: string): string {
  try { return new Date(iso).toISOString().replace('T', ' ').substring(0, 16) } catch { return iso }
}

// ── Types ─────────────────────────────────────────────────────────

interface TradeHistoryRow {
  ticket: string
  type: string
  symbol: string
  open_time: string
  close_time: string
  pips: number
  profit: number
  commission: number
}

interface ViolationWithRule {
  id: string
  ticket: string
  rule_id: string
  auto_note: string
  trading_rules: {
    id: string
    code: string
    name: string
    category: string
    severity: string
  } | null
}

interface RuleOption {
  id: string
  code: string
  name: string
  category: string
  severity: string
}

interface ViolationRow {
  ticket: string
  code: string
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
}

interface AccountStats {
  total_trades: number
  win_trades: number
  total_pnl: number
  violations: number
}

async function fetchAccountStats(accountId: string): Promise<AccountStats> {
  const sb = supabase
  const [{ data: trades }, { count: vCount }] = await Promise.all([
    sb.from('trading_history').select('profit, commission').eq('account_id', accountId),
    sb.from('rule_violations').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
  ])
  const total = trades?.length ?? 0
  const wins  = trades?.filter(t => (t.profit ?? 0) > 0).length ?? 0
  const pnl   = trades?.reduce((s, t) => s + (t.profit ?? 0) + (t.commission ?? 0), 0) ?? 0
  return { total_trades: total, win_trades: wins, total_pnl: pnl, violations: vCount ?? 0 }
}

// ── ViolationBadge ────────────────────────────────────────────────

function ViolationBadge({
  violation,
  onDelete,
}: {
  violation: ViolationWithRule
  onDelete: (id: string) => void
}) {
  const rule = Array.isArray(violation.trading_rules)
    ? violation.trading_rules[0]
    : violation.trading_rules
  const isCritical = rule?.severity === 'critical'
  const label = rule?.code || rule?.name || violation.rule_id
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs flex items-center gap-1 whitespace-nowrap ${
      isCritical
        ? 'bg-red-900 text-red-300 border border-red-700'
        : 'bg-yellow-900 text-yellow-300 border border-yellow-700'
    }`}>
      {label}
      <button
        onClick={() => onDelete(violation.id)}
        className="opacity-60 hover:opacity-100 cursor-pointer leading-none"
        title={`Remove ${label}`}
      >
        ×
      </button>
    </span>
  )
}

// ── AddViolationDropdown (portal-style, fixed position) ───────────

const CATEGORY_ORDER = ['Risk', 'Timing', 'Behavior', 'Drawdown']

interface DropdownPos {
  anchorTop: number
  anchorBottom: number
  left: number
  openUpward: boolean
}

function AddViolationDropdown({
  rules,
  pos,
  onSelect,
  onClose,
}: {
  rules: RuleOption[]
  pos: DropdownPos
  onSelect: (ruleId: string) => void
  onClose: () => void
}) {
  const byCategory: Record<string, RuleOption[]> = {}
  for (const r of rules) {
    if (!byCategory[r.category]) byCategory[r.category] = []
    byCategory[r.category].push(r)
  }
  const sortedCats = [
    ...CATEGORY_ORDER.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-52 max-h-72 overflow-y-auto"
        style={pos.openUpward
          ? { top: pos.anchorTop - 4, left: pos.left, transform: 'translateY(-100%)' }
          : { top: pos.anchorBottom + 4, left: pos.left }
        }
      >
        {sortedCats.map(cat => (
          <div key={cat}>
            <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-800">
              {cat}
            </p>
            {(byCategory[cat] ?? []).map(rule => (
              <button
                key={rule.id}
                onClick={e => { e.stopPropagation(); onSelect(rule.id) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition text-left"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  rule.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                {rule.name}
              </button>
            ))}
          </div>
        ))}
        {rules.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-500 text-center">No rules available</p>
        )}
      </div>
    </>
  )
}

// ── PasswordScreen ────────────────────────────────────────────────

function PasswordScreen({ onUnlock }: { onUnlock: () => void }) {
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
        onUnlock()
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
          <h1 className="text-white text-xl font-bold">🔓 Unlock Journal</h1>
          <p className="text-gray-400 text-sm mt-1">Enter password to continue</p>
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
  const ic = 'w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition'
  const lc = 'text-xs text-gray-400 font-medium mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base mb-5">Add Trading Account</h3>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={lc}>Broker *</p>
              <input list="broker-list" value={broker} onChange={e => setBroker(e.target.value)} placeholder="e.g. FTMO" className={ic} />
              <datalist id="broker-list">{['FTMO', 'Exness', 'Other'].map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <p className={lc}>Account Code *</p>
              <input value={accountCode} onChange={e => setAccountCode(e.target.value)} placeholder="e.g. 123456" className={ic} />
            </div>
          </div>
          <div>
            <p className={lc}>Account Type</p>
            <select value={accountType} onChange={e => handleTypeChange(e.target.value)} className={ic}>
              {presetKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <p className={lc}>Display Name (optional)</p>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. My FTMO Account" className={ic} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className={lc}>Currency</p><input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="USD" className={ic} /></div>
            <div><p className={lc}>Initial Balance</p><input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} placeholder="e.g. 100000" className={ic} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><p className={lc}>Daily DD %</p><input type="number" step="0.1" value={dailyDdPct} onChange={e => setDailyDdPct(e.target.value)} placeholder="—" className={ic} /></div>
            <div><p className={lc}>Total DD %</p><input type="number" step="0.1" value={totalDdPct} onChange={e => setTotalDdPct(e.target.value)} placeholder="—" className={ic} /></div>
            <div><p className={lc}>DD Type</p><div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400">{ddTypeLabel}</div></div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-600 transition">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition">{saving ? 'Saving…' : 'Save'}</button>
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

  useEffect(() => {
    if (!result.violations_found) return
    supabase
      .from('trading_rules')
      .select('code, name')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string> = {}
        for (const r of data) map[r.code] = r.name
        setRuleNames(map)
      })
  }, [result])

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400">
        <span className="text-green-400 font-semibold">✓ {result.tradesAdded} trades</span>
        {' → Sheets · Notion · Supabase '}
        <span className="text-gray-600">|</span>
        {' '}
        <span className="text-gray-500">{result.totalParsed - result.tradesAdded} duplicates skipped</span>
      </p>

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
              {nWarning  > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-950 text-yellow-400">Warning: {nWarning}</span>}
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
                      <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{ruleNames[v.code] ?? v.code}</td>
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

function Dashboard({ onLock, onLogout }: { onLock: () => void; onLogout: () => void }) {
  // Account
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  // Upload
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadToast, setUploadToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')

  // Stats strip
  const [accountStats, setAccountStats] = useState<AccountStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showViolationsBreakdown, setShowViolationsBreakdown] = useState(false)

  // Re-scan
  const [isRescanning, setIsRescanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)

  // Trade history
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryRow[]>([])
  const [tradeHistoryLoading, setTradeHistoryLoading] = useState(false)

  // Violations (joined with rule info)
  const [violations, setViolations] = useState<ViolationWithRule[]>([])

  // All rules for add-violation dropdown
  const [allRules, setAllRules] = useState<RuleOption[]>([])

  // Dropdown anchor: ticket + viewport position of the + button
  const [addingForTicket, setAddingForTicket] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const selectedAccount = accounts.find(a => a.id === selectedId) ?? null

  // Prevent browser navigation when dragging files anywhere on page
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault() }
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
      .catch(err => console.error('[Dashboard] getAccounts error:', err))
      .finally(() => setLoadingAccounts(false))
  }, [])

  // Load all active trading rules for the add-violation dropdown (once)
  useEffect(() => {
    console.log('fetchRules called')
    console.log('supabase URL available:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('supabase KEY available:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    supabase
      .from('trading_rules')
      .select('id, code, name, category, severity')
      .eq('is_active', true)
      .order('category')
      .then(({ data, error }) => {
        if (error) console.error('fetchRules error:', error)
        setAllRules((data as RuleOption[]) ?? [])
      })
  }, [])

  // ── Data loaders ─────────────────────────────────────────────────

  async function loadTradeHistory(accountId: string) {
    console.log('Fetching trades for account:', accountId)
    setTradeHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('trading_history')
        .select('ticket, type, symbol, open_time, close_time, pips, profit, commission')
        .eq('account_id', accountId)
        .order('open_time', { ascending: false })
      if (error) console.error('fetchTrades error:', error)
      console.log('Trades fetched:', data?.length, data?.[0])
      setTradeHistory((data as TradeHistoryRow[]) ?? [])
    } finally {
      setTradeHistoryLoading(false)
    }
  }

  async function loadViolations(accountId: string) {
    const { data, error } = await supabase
      .from('rule_violations')
      .select(`
        id,
        ticket,
        rule_id,
        account_id,
        auto_note,
        trading_rules (
          id,
          code,
          name,
          category,
          severity
        )
      `)
      .eq('account_id', accountId)
    if (error) console.error('fetchViolations error:', error)
    setViolations((data as unknown as ViolationWithRule[]) ?? [])
  }

  // Reload all data when selected account changes
  useEffect(() => {
    if (!selectedAccount) {
      setAccountStats(null)
      setTradeHistory([])
      setViolations([])
      return
    }
    const id = selectedAccount.id
    setStatsLoading(true)
    fetchAccountStats(id)
      .then(setAccountStats)
      .catch(() => setAccountStats(null))
      .finally(() => setStatsLoading(false))
    void loadTradeHistory(id)
    void loadViolations(id)
  }, [selectedAccount?.id])

  // ── Re-scan ───────────────────────────────────────────────────────

  async function doRescan(accountId: string) {
    setIsRescanning(true)
    try {
      await fetch('/api/trading-journal/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      })
      await Promise.all([
        loadViolations(accountId),
        fetchAccountStats(accountId).then(setAccountStats).catch(() => {}),
      ])
    } catch {
      // non-fatal
    } finally {
      setIsRescanning(false)
    }
  }

  async function handleRescan() {
    if (!selectedId) return
    await doRescan(selectedId)
    setScanDone(true)
    setTimeout(() => setScanDone(false), 2000)
  }

  // ── Violation CRUD ────────────────────────────────────────────────

  async function handleAddViolation(ticket: string, ruleId: string) {
    if (!selectedId) return
    console.log('addViolation called:', { ticket, accountId: selectedId, ruleId })
    setAddingForTicket(null)
    setDropdownPos(null)
    const res = await fetch('/api/trading-journal/violations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedId, ticket, rule_id: ruleId }),
    })
    console.log('addViolation response status:', res.status)
    const result = await res.json()
    console.log('addViolation result:', result)
    if (res.ok) {
      await loadViolations(selectedId)
      fetchAccountStats(selectedId).then(setAccountStats).catch(() => {})
    }
  }

  async function handleDeleteViolation(violationId: string) {
    const res = await fetch(`/api/trading-journal/violations/${violationId}`, { method: 'DELETE' })
    if (res.ok && selectedId) {
      await loadViolations(selectedId)
      fetchAccountStats(selectedId).then(setAccountStats).catch(() => {})
    }
  }

  // ── Upload ────────────────────────────────────────────────────────

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
        body: formData,
      })
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
      } else {
        setResult(data as UploadResult)
        setUploadSuccess(true)
        await loadTradeHistory(selectedId)
        void doRescan(selectedId)
        // Close modal after 2s, then show toast
        setTimeout(() => {
          setShowUploadModal(false)
          setUploadSuccess(false)
          const n = (data as UploadResult).tradesAdded
          setUploadToast(`✓ ${n} trade${n !== 1 ? 's' : ''} synced`)
          setTimeout(() => setUploadToast(null), 3000)
        }, 2000)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Trading Journal</h1>
            <p className="text-gray-500 text-sm mt-0.5">Upload FTMO CSV → Sheets · Notion · Supabase</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (selectedId) { setError(''); setShowUploadModal(true) } }}
              disabled={!selectedId}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded-full font-medium transition"
            >
              ↑ Upload CSV
            </button>
            <a href="/trading-journal/settings" className="text-gray-400 hover:text-white text-sm transition">⚙ Settings</a>
            <button onClick={onLock} className="text-gray-400 hover:text-white text-sm transition">🔒 Lock</button>
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
                      ? 'bg-violet-600 text-white'
                      : 'bg-transparent border border-gray-600 text-gray-300 hover:border-gray-400'
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
            <div className="relative pt-3 border-t border-gray-800">
              <div className="flex flex-wrap items-center gap-0 text-xs divide-x divide-gray-800">
                {statsLoading ? (
                  <span className="text-gray-600 px-3">Loading stats…</span>
                ) : accountStats ? (
                  <>
                    <span className="text-gray-400 px-3">
                      Trades: <span className="text-gray-200 font-medium">{accountStats.total_trades}</span>
                    </span>
                    <span className="text-gray-400 px-3">
                      Win Rate: <span className="text-gray-200 font-medium">
                        {accountStats.total_trades > 0
                          ? ((accountStats.win_trades / accountStats.total_trades) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </span>
                    <span className="text-gray-400 px-3">
                      P&amp;L: <span className={`font-semibold ${accountStats.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {accountStats.total_pnl >= 0 ? '+' : ''}${accountStats.total_pnl.toFixed(2)}
                      </span>
                    </span>
                    <span className="px-3">
                      <button
                        onClick={() => setShowViolationsBreakdown(v => !v)}
                        className={`flex items-center gap-1 ${accountStats.violations > 0 ? 'text-yellow-500' : 'text-gray-400'} hover:opacity-80 transition`}
                      >
                        ⚠ Violations: <span className="font-medium">{accountStats.violations}</span>
                        <span className="ml-1 text-gray-600">{showViolationsBreakdown ? '▴' : '▾'}</span>
                      </button>
                    </span>
                    <span className="px-3">
                      <button
                        onClick={handleRescan}
                        disabled={isRescanning}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                          scanDone
                            ? 'bg-green-800 text-green-300'
                            : 'bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-70 disabled:cursor-not-allowed'
                        }`}
                      >
                        <span className={isRescanning ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
                        {scanDone ? '✓ Scan complete' : isRescanning ? 'Scanning…' : 'Re-scan rules'}
                      </button>
                    </span>
                  </>
                ) : null}
              </div>

              {/* Violations breakdown panel */}
              {showViolationsBreakdown && violations.length > 0 && (() => {
                const grouped: Record<string, { name: string; severity: string; count: number }> = {}
                for (const v of violations) {
                  const rule = Array.isArray(v.trading_rules) ? v.trading_rules[0] : v.trading_rules
                  const key = rule?.code || v.rule_id
                  if (!grouped[key]) grouped[key] = { name: rule?.name || key, severity: rule?.severity || 'warning', count: 0 }
                  grouped[key].count++
                }
                const items = Object.entries(grouped).sort((a, b) => b[1].count - a[1].count)
                return (
                  <div className="absolute left-0 top-full mt-1 z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl min-w-56 py-1">
                    {items.map(([code, { name, severity, count }]) => (
                      <div key={code} className="flex items-center justify-between px-4 py-2 text-xs hover:bg-gray-700/50">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                          <span className="text-gray-200">{name}</span>
                        </div>
                        <span className="text-gray-400 font-medium ml-4">{count}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Upload result summary + violations (shown after modal closes) */}
        {result && !showUploadModal && <ResultPanel result={result} />}

        {/* Trade History table */}
        {selectedAccount && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Trade History</h2>
              <span className="text-gray-500 text-sm">
                {tradeHistoryLoading ? 'Loading…' : `${tradeHistory.length} trades`}
              </span>
            </div>

            {tradeHistoryLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tradeHistory.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                No trades yet — upload a CSV to get started
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Ticket', 'Type', 'Symbol', 'Open', 'Close', 'Pips', 'Profit', 'Violations'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tradeHistory.map(t => {
                      const tradeViolations = violations.filter(v => v.ticket === t.ticket)
                      const isBuy = t.type.toLowerCase() === 'buy'
                      const isProfit = t.profit >= 0
                      return (
                        <tr key={t.ticket} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                          <td className="px-4 py-3 font-mono text-gray-300 text-xs">{t.ticket}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              isBuy ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
                            }`}>
                              {t.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-200 font-medium">{t.symbol}</td>
                          <td className="px-4 py-3 font-mono text-gray-400 text-xs whitespace-nowrap">{fmtTimestamp(t.open_time)}</td>
                          <td className="px-4 py-3 font-mono text-gray-400 text-xs whitespace-nowrap">{fmtTimestamp(t.close_time)}</td>
                          <td className="px-4 py-3 text-gray-300">{t.pips}</td>
                          <td className={`px-4 py-3 font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{Number(t.profit).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {tradeViolations.map(v => (
                                <ViolationBadge key={v.id} violation={v} onDelete={handleDeleteViolation} />
                              ))}
                              <button
                                onClick={e => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  if (addingForTicket === t.ticket) {
                                    setAddingForTicket(null)
                                    setDropdownPos(null)
                                  } else {
                                    const openUpward = window.innerHeight - rect.bottom < 300
                                    setAddingForTicket(t.ticket)
                                    setDropdownPos({ anchorTop: rect.top, anchorBottom: rect.bottom, left: rect.left, openUpward })
                                  }
                                }}
                                className="w-5 h-5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs flex items-center justify-center transition flex-shrink-0"
                                title="Tag a violation"
                              >
                                ＋
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add-violation dropdown (rendered outside the table to avoid overflow clipping) */}
      {addingForTicket && dropdownPos && (() => {
        const appliedRuleIds = new Set(violations.filter(v => v.ticket === addingForTicket).map(v => v.rule_id))
        const availableRules = allRules.filter(r => !appliedRuleIds.has(r.id))
        return (
          <AddViolationDropdown
            rules={availableRules}
            pos={dropdownPos}
            onSelect={ruleId => handleAddViolation(addingForTicket, ruleId)}
            onClose={() => { setAddingForTicket(null); setDropdownPos(null) }}
          />
        )
      })()}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !uploading && setShowUploadModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">Upload FTMO CSV</h3>
              {!uploading && (
                <button onClick={() => setShowUploadModal(false)} className="text-gray-500 hover:text-white text-xl leading-none transition">×</button>
              )}
            </div>

            <div
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragging(false) }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); setDragging(false)
                const f = e.dataTransfer.files[0]; if (f) handleUpload(f)
              }}
              onClick={() => !uploading && !uploadSuccess && fileRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-10 text-center transition select-none cursor-pointer ${
                uploadSuccess
                  ? 'border-green-700 bg-green-900/20'
                  : dragging
                  ? 'border-violet-500 bg-violet-500/10'
                  : uploading
                  ? 'border-gray-700 bg-gray-800 cursor-not-allowed'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
              />
              {uploadSuccess ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-3xl">✓</div>
                  <p className="text-green-400 font-semibold">{result?.tradesAdded} trades synced</p>
                  <p className="text-gray-500 text-sm">Closing…</p>
                </div>
              ) : uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-violet-400 text-sm font-medium">Uploading and processing…</p>
                </div>
              ) : (
                <>
                  <div className="text-3xl mb-3">📂</div>
                  <p className="text-gray-200 font-semibold">Drop FTMO CSV here</p>
                  <p className="text-gray-500 text-sm mt-1">or click to browse</p>
                </>
              )}
            </div>

            {error && (
              <p className="mt-3 text-red-400 text-xs">{error}</p>
            )}
          </div>
        </div>
      )}

      {/* Success toast */}
      {uploadToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-800 text-green-200 text-sm font-medium px-5 py-2.5 rounded-full shadow-2xl">
          {uploadToast}
        </div>
      )}

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
  const [session, setSession] = useState<unknown>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isLocked, setIsLocked] = useState(false)

  useEffect(() => {
    authSupabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessionLoading(false)
      if (!session) {
        window.location.href = '/login?next=/trading-journal'
        return
      }
      // Ensure journal_auth cookie is set so API routes accept cookie auth
      document.cookie = 'journal_auth=true; path=/; max-age=86400; SameSite=Strict'
      const locked = document.cookie.split(';').some(c => c.trim() === 'journal_locked=true')
      setIsLocked(locked)
    })
  }, [])

  function handleLock() {
    document.cookie = 'journal_locked=true; path=/; max-age=86400; SameSite=Strict'
    setIsLocked(true)
  }

  async function handleLogout() {
    document.cookie = 'journal_auth=; path=/; max-age=0'
    document.cookie = 'journal_locked=; path=/; max-age=0'
    await authSupabase.auth.signOut()
    window.location.href = '/login'
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="animate-spin text-white text-2xl inline-block">↻</span>
      </div>
    )
  }

  if (!session) return null // redirect in progress

  if (isLocked) {
    return (
      <PasswordScreen onUnlock={() => {
        document.cookie = 'journal_locked=; path=/; max-age=0'
        setIsLocked(false)
      }} />
    )
  }

  return <Dashboard onLock={handleLock} onLogout={handleLogout} />
}
