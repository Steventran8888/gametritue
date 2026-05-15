'use client'

import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { createClient as createAuthClient } from '../lib/supabase'
import {
  ACCOUNT_TYPE_PRESETS,
  type TradingAccount,
  type AccountInput,
  getAccounts,
  createAccount,
} from '@/lib/tradingAccounts'

// createBrowserClient — session-aware, works with RLS
const supabase = createAuthClient()
const authSupabase = supabase

const AVATAR_BASE = 'https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/Avatar'
const AVATAR_BG_COLORS = ['#3b4bc8','#3aaa35','#1e9e7e','#1788c2','#5c35d4','#7c28cc','#f7941d','#cc1a6e','#d42020','#ffc107']
function resolveAvatar(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${AVATAR_BASE}/${url}`
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

function fmtTime(iso: string): string {
  try { return new Date(iso).toISOString().substring(11, 16) } catch { return '' }
}

function getDateKey(iso: string): string {
  try { return new Date(iso).toISOString().substring(0, 10) } catch { return iso.substring(0, 10) }
}

const VI_DAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

function formatDayLabel(dateKey: string): string {
  try {
    const d = new Date(dateKey + 'T00:00:00Z')
    const dow = VI_DAYS[d.getUTCDay()]
    const dd  = String(d.getUTCDate()).padStart(2, '0')
    const mm  = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dow}, ${dd}/${mm}/${d.getUTCFullYear()}`
  } catch { return dateKey }
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
  duplicates_skipped: number
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

interface JournalEntry {
  id?: string
  account_id: string
  entry_date: string          // YYYY-MM-DD
  has_trades: boolean
  trade_count: number
  daily_pnl: number
  confidence_score: number | null
  market_overview: string | null
  strategy_decision: string | null
  setup_reasoning: string | null
  went_well: string | null
  mistakes_made: string | null
  lessons_learned: string | null
  rule_adjustments: string | null
}

interface DayGroup {
  dateKey: string
  dateLabel: string
  trades: TradeHistoryRow[]
  totalPnl: number
  criticalCount: number
  warningCount: number
  topCodes: { code: string; name: string; severity: string }[]
  dayViolations: ViolationWithRule[]
  journal: JournalEntry | null
}

function computeDayStats(
  dateKey: string,
  dayTrades: TradeHistoryRow[],
  violations: ViolationWithRule[],
  journal: JournalEntry | null,
): DayGroup {
  const totalPnl = dayTrades.reduce((s, t) => s + (t.profit ?? 0) + (t.commission ?? 0), 0)
  const ticketSet = new Set(dayTrades.map(t => t.ticket))
  const dayViolations = violations.filter(v => ticketSet.has(v.ticket))

  const codeCounts: Record<string, { name: string; severity: string; count: number }> = {}
  for (const v of dayViolations) {
    const rule = Array.isArray(v.trading_rules) ? v.trading_rules[0] : v.trading_rules
    const code = rule?.code || v.rule_id
    if (!codeCounts[code]) codeCounts[code] = { name: rule?.name || code, severity: rule?.severity || 'warning', count: 0 }
    codeCounts[code].count++
  }
  const topCodes = Object.entries(codeCounts)
    .map(([code, val]) => ({ code, ...val }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const criticalCount = dayViolations.filter(v => {
    const rule = Array.isArray(v.trading_rules) ? v.trading_rules[0] : v.trading_rules
    return rule?.severity === 'critical'
  }).length

  return {
    dateKey,
    dateLabel: formatDayLabel(dateKey),
    trades: dayTrades.sort((a, b) => a.close_time.localeCompare(b.close_time)),
    totalPnl,
    criticalCount,
    warningCount: dayViolations.length - criticalCount,
    topCodes,
    dayViolations,
    journal,
  }
}

function buildDayGroups(
  trades: TradeHistoryRow[],
  violations: ViolationWithRule[],
  journalEntries: JournalEntry[],
): DayGroup[] {
  if (trades.length === 0 && journalEntries.length === 0) return []

  const todayKey = getDateKey(new Date().toISOString())

  // Find earliest date across trades and journal entries
  const allKeys = [
    ...trades.map(t => getDateKey(t.close_time)),
    ...journalEntries.map(j => j.entry_date),
  ].filter(k => k <= todayKey)
  if (allKeys.length === 0) return []

  const earliestKey = allKeys.sort()[0]!

  // Build lookup maps
  const tradesByDay = new Map<string, TradeHistoryRow[]>()
  for (const t of trades) {
    const key = getDateKey(t.close_time)
    if (!tradesByDay.has(key)) tradesByDay.set(key, [])
    tradesByDay.get(key)!.push(t)
  }
  const journalByDay = new Map(journalEntries.map(j => [j.entry_date, j]))

  // Walk from today → earliest, newest first
  const result: DayGroup[] = []
  const cursor = new Date(todayKey + 'T00:00:00Z')
  const stop   = new Date(earliestKey + 'T00:00:00Z')

  while (cursor >= stop) {
    const dateKey = cursor.toISOString().substring(0, 10)
    const dayTrades = tradesByDay.get(dateKey) ?? []
    const journal = journalByDay.get(dateKey) ?? null
    result.push(computeDayStats(dateKey, dayTrades, violations, journal))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return result
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
        <span className="text-green-400 font-semibold">✅ {result.supabase_inserted} trades synced</span>
        {result.duplicates_skipped > 0 && (
          <span className="text-yellow-500 ml-2">· ⚠️ {result.duplicates_skipped} trùng đã bỏ qua</span>
        )}
        {' '}
        <span className="text-gray-600">→ Sheets · Notion · Supabase</span>
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

// ── Journal helpers ───────────────────────────────────────────────

const EMPTY_JOURNAL: Omit<JournalEntry, 'account_id' | 'entry_date'> = {
  has_trades: false, trade_count: 0, daily_pnl: 0,
  confidence_score: null, market_overview: null, strategy_decision: null,
  setup_reasoning: null, went_well: null, mistakes_made: null,
  lessons_learned: null, rule_adjustments: null,
}

function JournalField({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string | null; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-1.5">{label}</p>
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500 transition"
      />
    </div>
  )
}

function JournalPanel({ dateKey, dateLabel, accountId, onClose, onSaved }: {
  dateKey: string
  dateLabel: string
  accountId: string
  onClose: () => void
  onSaved: (entry: JournalEntry) => void
}) {
  const [form, setForm] = useState<Omit<JournalEntry, 'account_id' | 'entry_date'>>({ ...EMPTY_JOURNAL })
  const [loading, setLoading] = useState(true)
  const [autoStatus, setAutoStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [btnStatus, setBtnStatus]   = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch fresh entry from API every time the panel opens for a date
  useEffect(() => {
    setLoading(true)
    setForm({ ...EMPTY_JOURNAL })
    setAutoStatus('idle')
    setBtnStatus('idle')
    fetch(`/api/trading-journal/journal?account_id=${accountId}&entry_date=${dateKey}`)
      .then(r => r.json())
      .then(data => {
        if (data) setForm({ ...EMPTY_JOURNAL, ...data })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateKey, accountId])

  async function doSave(payload: Omit<JournalEntry, 'account_id' | 'entry_date'>): Promise<JournalEntry | null> {
    const body = { account_id: accountId, entry_date: dateKey, ...payload }
    console.log('[JournalPanel] saving:', body)
    const res = await fetch('/api/trading-journal/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    console.log('[JournalPanel] save response:', res.status, json)
    if (!res.ok) return null
    onSaved(json as JournalEntry)
    return json as JournalEntry
  }

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    const updated = { ...form, [field]: value }
    setForm(updated)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setAutoStatus('saving')
    saveTimer.current = setTimeout(async () => {
      const saved = await doSave(updated)
      setAutoStatus(saved ? 'saved' : 'idle')
      if (saved) setTimeout(() => setAutoStatus('idle'), 2000)
    }, 2000)
  }

  async function handleSaveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setBtnStatus('saving')
    const saved = await doSave(form)
    setAutoStatus('idle')
    setBtnStatus(saved ? 'saved' : 'idle')
    if (saved) setTimeout(() => setBtnStatus('idle'), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="w-full max-w-lg bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">{dateLabel}</h2>
            <p className={`text-xs mt-0.5 transition ${
              autoStatus === 'saving' ? 'text-yellow-500' :
              autoStatus === 'saved'  ? 'text-green-500' : 'text-gray-600'
            }`}>
              {loading ? 'Đang tải…' : autoStatus === 'saving' ? 'Đang lưu…' : autoStatus === 'saved' ? '✓ Đã lưu' : 'Journal'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none transition mt-0.5">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Toggle + Confidence */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => update('has_trades', !form.has_trades)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    form.has_trades ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {form.has_trades ? '✓ Có lệnh hôm nay' : 'Không vào lệnh'}
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-600 mr-1">Confidence</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => update('confidence_score', form.confidence_score === n ? null : n)}
                      className={`text-base transition ${(form.confidence_score ?? 0) >= n ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}
                    >●</button>
                  ))}
                </div>
              </div>

              {/* Section 1: Context */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bối cảnh</p>
                <JournalField label="Market Overview" placeholder="Thị trường hôm nay như thế nào?" value={form.market_overview} onChange={v => update('market_overview', v || null)} />
                <JournalField label="Strategy Decision" placeholder="Quyết định hôm nay làm gì?" value={form.strategy_decision} onChange={v => update('strategy_decision', v || null)} />
              </div>

              {/* Section 2: Review */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Review</p>
                <JournalField label="🎯 Setup & Reasoning" placeholder="Setup và lý do vào lệnh..." value={form.setup_reasoning} onChange={v => update('setup_reasoning', v || null)} />
                <JournalField label="📈 What Went Well" placeholder="Điều gì đã làm tốt..." value={form.went_well} onChange={v => update('went_well', v || null)} />
                <JournalField label="❌ Mistakes Made" placeholder="Lỗi nào đã mắc phải..." value={form.mistakes_made} onChange={v => update('mistakes_made', v || null)} />
                <JournalField label="📚 Lessons Learned" placeholder="Bài học rút ra..." value={form.lessons_learned} onChange={v => update('lessons_learned', v || null)} />
                <JournalField label="🔄 Rule Adjustments" placeholder="Cần điều chỉnh rule gì không..." value={form.rule_adjustments} onChange={v => update('rule_adjustments', v || null)} />
              </div>
            </>
          )}
        </div>

        {/* Save button — sticky at bottom */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-800 bg-gray-900">
          <button
            onClick={handleSaveNow}
            disabled={loading || btnStatus === 'saving'}
            style={{ background: btnStatus === 'saved' ? '#166534' : '#3b4bc8' }}
            className="w-full h-[52px] rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60"
          >
            {btnStatus === 'saving' ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Đang lưu…</>
            ) : btnStatus === 'saved' ? (
              <>✓ Đã lưu</>
            ) : (
              <>💾 Lưu</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Performance helpers ───────────────────────────────────────────

function getWeekKey(isoDate: string): string {
  const d = new Date(isoDate)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().substring(0, 10)
}
function weekLabel(weekKey: string): string {
  const d = new Date(weekKey + 'T00:00:00Z')
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`
}

type WeekRow = {
  label: string; pnl: number; trades: number; wins: number
  Overtrading: number; Session: number; Risk: number
  Hold: number; Behavior: number; Other: number
}

function categorizeViolation(code: string): keyof WeekRow {
  const c = (code ?? '').toUpperCase()
  if (c.includes('OVERTRAD')) return 'Overtrading'
  if (c.includes('SESSION'))  return 'Session'
  if (c.includes('RISK'))     return 'Risk'
  if (c.includes('HOLD'))     return 'Hold'
  if (c.includes('REVENGE') || c.includes('FOMO')) return 'Behavior'
  return 'Other'
}

function buildWeeklyData(trades: TradeHistoryRow[], violations: ViolationWithRule[]): WeekRow[] {
  const weeks = new Map<string, WeekRow>()
  const ticketToWeek = new Map<string, string>()

  for (const t of trades) {
    const key = getWeekKey(t.close_time)
    ticketToWeek.set(t.ticket, key)
    if (!weeks.has(key)) weeks.set(key, { label: weekLabel(key), pnl: 0, trades: 0, wins: 0, Overtrading: 0, Session: 0, Risk: 0, Hold: 0, Behavior: 0, Other: 0 })
    const w = weeks.get(key)!
    w.pnl += (t.profit ?? 0) + (t.commission ?? 0)
    w.trades++
    if ((t.profit ?? 0) > 0) w.wins++
  }

  for (const v of violations) {
    const key = ticketToWeek.get(v.ticket)
    if (!key || !weeks.has(key)) continue
    const rule = Array.isArray(v.trading_rules) ? v.trading_rules[0] : v.trading_rules
    const code = rule?.code || v.rule_id
    const cat = categorizeViolation(code)
    const w = weeks.get(key)!
    ;(w[cat] as number)++
  }

  return Array.from(weeks.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
}

function computeSummary(data: WeekRow[]) {
  if (data.length < 4) return null
  const last4 = data.slice(-4)
  const prev4 = data.slice(-8, -4)
  if (prev4.length === 0) return null

  const totalViol = (rows: WeekRow[]) => rows.reduce((s,w) => s + w.Overtrading + w.Session + w.Risk + w.Hold + w.Behavior + w.Other, 0)
  const totalTrades = (rows: WeekRow[]) => rows.reduce((s,w) => s + w.trades, 0)
  const avgVR = (rows: WeekRow[]) => { const t = totalTrades(rows); return t > 0 ? totalViol(rows) / t : 0 }
  const avgWR = (rows: WeekRow[]) => { const t = totalTrades(rows); const w = rows.reduce((s,r) => s + r.wins, 0); return t > 0 ? (w/t)*100 : 0 }
  const avgPnl = (rows: WeekRow[]) => rows.reduce((s,w) => s + w.pnl, 0) / rows.length
  const avgT   = (rows: WeekRow[]) => totalTrades(rows) / rows.length

  const l4vr = avgVR(last4), p4vr = avgVR(prev4)
  const l4wr = avgWR(last4), p4wr = avgWR(prev4)
  const l4pnl = avgPnl(last4), p4pnl = avgPnl(prev4)
  const l4t = avgT(last4), p4t = avgT(prev4)
  const vrChange = p4vr > 0 ? ((l4vr - p4vr) / p4vr) * 100 : 0
  const tChange  = p4t  > 0 ? ((l4t  - p4t)  / p4t)  * 100 : 0

  let conclusion: string
  if (vrChange < -10) {
    conclusion = `✅ Kỷ luật đang cải thiện — tỉ lệ vi phạm giảm ${Math.abs(vrChange).toFixed(0)}% so với 4 tuần trước`
  } else if (vrChange > 10) {
    conclusion = `⚠️ Cần chú ý — tỉ lệ vi phạm tăng ${vrChange.toFixed(0)}% dù số lệnh ${tChange > 0 ? 'tăng' : 'giảm'}`
  } else {
    conclusion = `➡️ Kỷ luật ổn định — tỉ lệ vi phạm duy trì ở mức ${l4vr.toFixed(2)} vi phạm/lệnh`
  }

  return { l4vr, p4vr, vrChange, l4wr, p4wr, l4pnl, p4pnl, l4t, p4t, tChange, conclusion }
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#1e2535', border: '1px solid #334155',
  borderRadius: 8, color: '#e2e8f0', fontSize: 12,
}

function PerformanceView({ tradeHistory, violations, customLabels, tradeLabelMap }: {
  tradeHistory: TradeHistoryRow[]
  violations: ViolationWithRule[]
  customLabels: CustomLabel[]
  tradeLabelMap: Record<string, string[]>
}) {
  const data    = buildWeeklyData(tradeHistory, violations)
  const summary = computeSummary(data)

  // Build weekly label data
  const ticketToWeek = new Map(tradeHistory.map(t => [t.ticket, getWeekKey(t.close_time)]))
  const weekLabelData = new Map<string, { label: string; positive: number; negative: number }>()
  for (const [ticket, labelIds] of Object.entries(tradeLabelMap)) {
    const weekKey = ticketToWeek.get(ticket)
    if (!weekKey) continue
    if (!weekLabelData.has(weekKey)) weekLabelData.set(weekKey, { label: weekLabel(weekKey), positive: 0, negative: 0 })
    const w = weekLabelData.get(weekKey)!
    for (const lid of labelIds) {
      const lbl = customLabels.find(l => l.id === lid)
      if (lbl?.type === 'positive') w.positive++
      else if (lbl?.type === 'negative') w.negative++
    }
  }
  const labelWeekData = Array.from(weekLabelData.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
  const totalPos = labelWeekData.reduce((s,w) => s + w.positive, 0)
  const totalNeg = labelWeekData.reduce((s,w) => s + w.negative, 0)
  const axisStyle = { fill: '#94a3b8', fontSize: 11 }

  if (tradeHistory.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <p className="text-gray-500 text-sm">Chưa có dữ liệu giao dịch để phân tích</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chart 1 — Vi phạm theo tuần */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">Vi phạm theo tuần</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barSize={14} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
            <Bar dataKey="Overtrading" stackId="v" fill="#ef4444" />
            <Bar dataKey="Session"     stackId="v" fill="#f97316" />
            <Bar dataKey="Risk"        stackId="v" fill="#eab308" />
            <Bar dataKey="Hold"        stackId="v" fill="#22c55e" />
            <Bar dataKey="Behavior"    stackId="v" fill="#3b82f6" />
            <Bar dataKey="Other"       stackId="v" fill="#a855f7" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2 — P&L theo tuần */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">P&amp;L theo tuần</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barSize={20} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={56} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Bar dataKey="pnl" name="P&L" radius={[3,3,0,0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3 — Custom labels by week */}
      {labelWeekData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-4">🏷 Nhãn tùy chỉnh theo tuần</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={labelWeekData} barSize={16} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
              <Bar dataKey="positive" name="Tích cực 👍" fill="#22c55e" radius={[3,3,0,0]} />
              <Bar dataKey="negative" name="Tiêu cực 👎" fill="#ef4444" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary card */}
      {summary && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-semibold text-sm">📊 Tổng kết xu hướng</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: 'Lệnh/tuần',    curr: summary.l4t.toFixed(1),   prev: summary.p4t.toFixed(1),   change: summary.tChange },
              { label: 'Vi phạm/lệnh', curr: summary.l4vr.toFixed(2),  prev: summary.p4vr.toFixed(2),  change: -summary.vrChange },
              { label: 'Win rate',     curr: `${summary.l4wr.toFixed(1)}%`, prev: `${summary.p4wr.toFixed(1)}%`, change: summary.l4wr - summary.p4wr },
              { label: 'P&L/tuần',    curr: `$${summary.l4pnl.toFixed(0)}`, prev: `$${summary.p4pnl.toFixed(0)}`, change: summary.l4pnl - summary.p4pnl },
            ] as { label: string; curr: string; prev: string; change: number }[]).map(item => (
              <div key={item.label} className="bg-gray-800 rounded-xl p-3">
                <p className="text-gray-500 text-xs mb-1">{item.label}</p>
                <p className="text-white font-bold text-lg leading-none">{item.curr}</p>
                <p className={`text-xs mt-1.5 ${item.change > 0 ? 'text-green-400' : item.change < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {item.change > 0 ? '↑' : item.change < 0 ? '↓' : '→'} vs {item.prev}
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-300 bg-gray-800 rounded-xl px-4 py-3 leading-relaxed">
            {summary.conclusion}
          </p>
          {(totalPos > 0 || totalNeg > 0) && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-400 font-medium">👍 {totalPos} nhãn tích cực</span>
              <span className="text-gray-600">·</span>
              <span className="text-red-400 font-medium">👎 {totalNeg} nhãn tiêu cực</span>
              {totalPos + totalNeg > 0 && (
                <span className="text-gray-500">
                  — {totalPos > totalNeg
                    ? `✅ ${((totalPos / (totalPos + totalNeg)) * 100).toFixed(0)}% tích cực`
                    : `📈 Cần cải thiện — ${((totalNeg / (totalPos + totalNeg)) * 100).toFixed(0)}% tiêu cực`}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Rules Modal ───────────────────────────────────────────────────

type RuleConfig = {
  timeframe: string
  r_size_pct: number
  max_trades_day: number
  min_rr: number
  min_hold_tf: number
  max_hold_tf: number
  allowed_sessions: string[]
  allow_weekend: boolean
  max_consec_loss: number
  revenge_window_min: number
  news_buffer_min: number
  rules_enabled: Record<string, boolean>
}

const TF_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
const TF_MINUTES_MAP: Record<string, number> = { '1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440,'1w':10080 }
const UNIT_MINS: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080 }
const SESSION_OPTS = ['Asian', 'European', 'US']

function parseTF(tf: string): { value: number; unit: string } {
  const m = tf.match(/^(\d+(?:\.\d+)?)(m|h|d|w)$/)
  return m ? { value: parseFloat(m[1] ?? '15'), unit: m[2] ?? 'm' } : { value: 15, unit: 'm' }
}

// ── Custom Label types & helpers ──────────────────────────────────

type CustomLabel = {
  id: string
  name: string
  type: 'positive' | 'negative'
  color: string
  colorName: string
}

const POSITIVE_COLORS = [
  { color: '#16a34a', name: 'Xuất sắc' },
  { color: '#22c55e', name: 'Tốt' },
  { color: '#3b4bc8', name: 'Đúng hướng' },
  { color: '#0891b2', name: 'Kỷ luật tốt' },
]
const NEGATIVE_COLORS = [
  { color: '#fbbf24', name: 'Nhắc nhở' },
  { color: '#f97316', name: 'Cảnh báo' },
  { color: '#f472b6', name: 'Vi phạm nhẹ' },
  { color: '#ef4444', name: 'Vi phạm' },
  { color: '#dc2626', name: 'Vi phạm nghiêm trọng' },
  { color: '#7c3aed', name: 'Lỗi hệ thống' },
]

function loadLabelStore(accountId: string): { labels: CustomLabel[]; tradeLabelMap: Record<string, string[]> } {
  try {
    const raw = localStorage.getItem(`custom_labels_${accountId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { labels: [], tradeLabelMap: {} }
}
function saveLabelStore(accountId: string, labels: CustomLabel[], tradeLabelMap: Record<string, string[]>) {
  try { localStorage.setItem(`custom_labels_${accountId}`, JSON.stringify({ labels, tradeLabelMap })) } catch {}
}

// ── CustomLabelsModal ─────────────────────────────────────────────

function CustomLabelsModal({ labels, onClose, onAdd, onDelete }: {
  labels: CustomLabel[]
  onClose: () => void
  onAdd: (l: CustomLabel) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'positive' | 'negative'>('positive')
  const [color, setColor] = useState(POSITIVE_COLORS[0]!.color)
  const palette = type === 'positive' ? POSITIVE_COLORS : NEGATIVE_COLORS

  function handleAdd() {
    if (!name.trim()) return
    const def = palette.find(c => c.color === color) ?? palette[0]!
    onAdd({ id: Date.now().toString(), name: name.trim(), type, color: def.color, colorName: def.name })
    setName('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-bold text-base">🏷 Nhãn tùy chỉnh</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {labels.length === 0
            ? <p className="text-gray-600 text-sm text-center py-2">Chưa có nhãn nào</p>
            : <div className="space-y-1.5">
                {labels.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-xl">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.color }} />
                    <span className="text-gray-200 text-sm flex-1 truncate">{l.name}</span>
                    <span className="text-gray-500 text-xs">{l.type === 'positive' ? '👍' : '👎'}</span>
                    <button onClick={() => onDelete(l.id)} className="text-gray-600 hover:text-red-400 transition text-sm">×</button>
                  </div>
                ))}
              </div>
          }
          <div className="border-t border-gray-800 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">+ Thêm nhãn mới</p>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Tên nhãn..."
              className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition" />
            <div className="flex gap-2">
              {(['positive', 'negative'] as const).map(t => (
                <button key={t} onClick={() => { setType(t); setColor(t === 'positive' ? POSITIVE_COLORS[0]!.color : NEGATIVE_COLORS[0]!.color) }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    type === t ? (t === 'positive' ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-red-600 text-red-400 bg-red-900/20') : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}>
                  {t === 'positive' ? '👍 Tích cực' : '👎 Tiêu cực'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {palette.map(c => (
                <button key={c.color} onClick={() => setColor(c.color)} title={c.name}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                  style={{ background: c.color, outline: color === c.color ? `3px solid ${c.color}` : 'none', outlineOffset: 2 }} />
              ))}
            </div>
            <button onClick={handleAdd} disabled={!name.trim()}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition">
              Thêm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_RULE_CONFIG: RuleConfig = {
  timeframe: '15m', r_size_pct: 1, max_trades_day: 3, min_rr: 2,
  min_hold_tf: 0.5, max_hold_tf: 10, allowed_sessions: ['Asian', 'European'],
  allow_weekend: false, max_consec_loss: 2, revenge_window_min: 15, news_buffer_min: 30,
  rules_enabled: {
    RISK_HIGH: true, RISK_MEDIUM: true, NO_SL: true, MARTINGALE: true,
    HOLD_TOO_SHORT: true, HOLD_TOO_LONG: true, SESSION_VIOLATION: true, NEWS_TRADE: false,
    OVERTRADING: true, REVENGE_TRADE: true, CONSEC_LOSS: true, RR_LOW: true, EARLY_EXIT: false,
  },
}

const RULE_DEFS: { code: string; group: string; name: string; desc: string; severity: string; stub?: boolean }[] = [
  { code: 'RISK_HIGH',         group: 'Risk',     name: 'Risk quá cao',       desc: 'Loss > 2R trong 1 lệnh',                           severity: 'critical' },
  { code: 'RISK_MEDIUM',       group: 'Risk',     name: 'Risk cao',           desc: 'Loss 1R–2R trong 1 lệnh',                          severity: 'warning'  },
  { code: 'NO_SL',             group: 'Risk',     name: 'Không có SL',        desc: 'Lệnh không đặt Stop Loss',                         severity: 'critical' },
  { code: 'MARTINGALE',        group: 'Risk',     name: 'Martingale',         desc: 'Tăng lot sau khi thua',                            severity: 'critical' },
  { code: 'HOLD_TOO_SHORT',    group: 'Time',     name: 'Hold quá ngắn',      desc: 'Hold < min_hold × timeframe',                      severity: 'warning'  },
  { code: 'HOLD_TOO_LONG',     group: 'Time',     name: 'Hold quá lâu',       desc: 'Hold > max_hold × timeframe',                      severity: 'warning'  },
  { code: 'SESSION_VIOLATION', group: 'Time',     name: 'Sai session',        desc: 'Vào lệnh ngoài session cho phép',                  severity: 'warning'  },
  { code: 'NEWS_TRADE',        group: 'Time',     name: 'Giao dịch tin tức',  desc: 'Vào lệnh gần high-impact news',                    severity: 'warning', stub: true },
  { code: 'OVERTRADING',       group: 'Behavior', name: 'Overtrading',        desc: 'Quá số lệnh/ngày cho phép',                        severity: 'critical' },
  { code: 'REVENGE_TRADE',     group: 'Behavior', name: 'Revenge trade',      desc: 'Vào lệnh ngay sau khi thua',                       severity: 'critical' },
  { code: 'CONSEC_LOSS',       group: 'Behavior', name: 'Thua liên tiếp',     desc: 'Thua quá số lệnh liên tiếp cho phép',              severity: 'critical' },
  { code: 'RR_LOW',            group: 'Behavior', name: 'RR thấp',            desc: 'RR thực tế < min RR',                              severity: 'warning'  },
  { code: 'EARLY_EXIT',        group: 'Behavior', name: 'Thoát sớm',          desc: 'Đóng lệnh trước TP khi đang lãi (actual RR < min RR)', severity: 'warning' },
]
const RULE_GROUPS = ['Risk', 'Time', 'Behavior']

function RulesModal({ accountId, accounts, onClose }: {
  accountId: string
  accounts: TradingAccount[]
  onClose: () => void
}) {
  const [tab, setTab]     = useState<1|2|3>(1)
  const [cfg, setCfg]     = useState<RuleConfig>({ ...DEFAULT_RULE_CONFIG })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  useEffect(() => {
    fetch(`/api/trading-journal/rule-config?account_id=${accountId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCfg(prev => ({ ...prev, ...data })); setLoading(false) })
      .catch(() => setLoading(false))
  }, [accountId])

  function set<K extends keyof RuleConfig>(key: K, val: RuleConfig[K]) {
    setCfg(c => ({ ...c, [key]: val }))
  }
  function toggleSession(s: string) {
    setCfg(c => ({
      ...c,
      allowed_sessions: c.allowed_sessions.includes(s)
        ? c.allowed_sessions.filter(x => x !== s)
        : [...c.allowed_sessions, s],
    }))
  }
  function toggleRule(code: string) {
    setCfg(c => ({ ...c, rules_enabled: { ...c.rules_enabled, [code]: !c.rules_enabled[code] } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/trading-journal/rule-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, account_id: accountId }),
      })
      for (const acc of accounts) {
        await fetch('/api/trading-journal/rescan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: acc.id }),
        })
      }
      setDone(true)
      setTimeout(() => { setDone(false); onClose() }, 1500)
    } finally {
      setSaving(false)
    }
  }

  const ic = 'bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition'
  const { value: tfValue, unit: tfUnit } = parseTF(cfg.timeframe)
  const tfMin = tfValue * (UNIT_MINS[tfUnit] ?? 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-white font-bold text-base">⚙ Rule Setup</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 flex-shrink-0">
          {(['Method', 'Session & Behavior', 'Rules On/Off'] as const).map((label, i) => (
            <button key={i}
              onClick={() => setTab((i + 1) as 1|2|3)}
              className={`flex-1 py-3 text-xs font-semibold transition ${
                tab === i + 1 ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* TAB 1: METHOD */}
              {tab === 1 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-1.5">
                      Timeframe <span className="text-gray-600">= {tfMin.toFixed(0)} phút</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="number" step="0.01" min="1" value={tfValue}
                        onChange={e => set('timeframe', `${parseFloat(e.target.value) || 1}${tfUnit}`)}
                        className={`${ic} flex-1`}
                      />
                      <select
                        value={tfUnit}
                        onChange={e => set('timeframe', `${tfValue}${e.target.value}`)}
                        className={`${ic} w-20`}
                      >
                        {['m','h','d','w'].map(u => <option key={u} value={u}>{u === 'm' ? 'phút' : u === 'h' ? 'giờ' : u === 'd' ? 'ngày' : 'tuần'}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">R Size <span className="text-gray-600">% of balance</span></p>
                      <input type="number" step="0.25" min="0.01" max="10" placeholder="0.5" value={cfg.r_size_pct}
                        onChange={e => set('r_size_pct', parseFloat(e.target.value) || 1)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">Max trades/day</p>
                      <input type="number" min="1" max="20" value={cfg.max_trades_day}
                        onChange={e => set('max_trades_day', parseInt(e.target.value) || 3)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">Min RR <span className="text-gray-600">(1:X)</span></p>
                      <input type="number" step="0.5" min="0.5" max="10" value={cfg.min_rr}
                        onChange={e => set('min_rr', parseFloat(e.target.value) || 2)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">
                        Min hold <span className="text-gray-600">× TF = {(cfg.min_hold_tf * tfMin).toFixed(0)}p</span>
                      </p>
                      <input type="number" step="0.25" min="0" value={cfg.min_hold_tf}
                        onChange={e => set('min_hold_tf', parseFloat(e.target.value) || 0)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">
                        Max hold <span className="text-gray-600">× TF = {(cfg.max_hold_tf * tfMin).toFixed(0)}p</span>
                      </p>
                      <input type="number" step="1" min="1" value={cfg.max_hold_tf}
                        onChange={e => set('max_hold_tf', parseFloat(e.target.value) || 10)} className={ic} />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SESSION & BEHAVIOR */}
              {tab === 2 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-2">Phiên giao dịch cho phép</p>
                    <div className="flex gap-3">
                      {SESSION_OPTS.map(s => {
                        const on = cfg.allowed_sessions.includes(s)
                        return (
                          <button key={s} onClick={() => toggleSession(s)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                              on ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-gray-700 text-gray-500 bg-gray-800/50 hover:border-gray-600'
                            }`}>
                            {on ? '✓' : '✗'} {s}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-gray-800">
                    <div>
                      <p className="text-sm text-gray-300">Cho phép giao dịch cuối tuần</p>
                      <p className="text-xs text-gray-600 mt-0.5">T7 và CN</p>
                    </div>
                    <button onClick={() => set('allow_weekend', !cfg.allow_weekend)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${cfg.allow_weekend ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cfg.allow_weekend ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">Max thua liên tiếp</p>
                      <input type="number" min="1" max="10" value={cfg.max_consec_loss}
                        onChange={e => set('max_consec_loss', parseInt(e.target.value) || 2)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">Revenge window <span className="text-gray-600">phút</span></p>
                      <input type="number" min="1" max="120" value={cfg.revenge_window_min}
                        onChange={e => set('revenge_window_min', parseInt(e.target.value) || 15)} className={ic} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">News buffer <span className="text-gray-600">phút</span></p>
                      <input type="number" min="0" max="60" value={cfg.news_buffer_min}
                        onChange={e => set('news_buffer_min', parseInt(e.target.value) || 30)} className={ic} />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RULES ON/OFF */}
              {tab === 3 && (
                <div className="space-y-4">
                  {RULE_GROUPS.map(group => (
                    <div key={group}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group}</p>
                      <div className="space-y-1">
                        {RULE_DEFS.filter(r => r.group === group).map(r => {
                          const on = cfg.rules_enabled[r.code] ?? false
                          return (
                            <div key={r.code}
                              className={`flex items-center gap-3 px-4 py-3 rounded-xl ${r.stub ? 'opacity-40' : 'hover:bg-gray-800/50'} transition`}>
                              <button onClick={() => !r.stub && toggleRule(r.code)}
                                disabled={r.stub}
                                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${on && !r.stub ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on && !r.stub ? 'left-[18px]' : 'left-0.5'}`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium ${on && !r.stub ? 'text-gray-200' : 'text-gray-500'}`}>{r.name}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    r.severity === 'critical' ? 'text-red-400 bg-red-950' : 'text-yellow-400 bg-yellow-950'
                                  }`}>{r.severity.toUpperCase()}</span>
                                  {r.stub && <span className="text-gray-600 text-xs">Soon</span>}
                                </div>
                                <p className="text-gray-600 text-xs mt-0.5">{r.desc}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-600 transition">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving || done}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 ${
              done ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white'
            }`}>
            {done ? '✓ Đã lưu' : saving
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Đang lưu & rescan…</>
              : 'Lưu & Rescan'}
          </button>
        </div>
      </div>
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
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [accountSelectorHighlight, setAccountSelectorHighlight] = useState(false)
  const [activeView, setActiveView] = useState<'timeline' | 'performance'>('timeline')
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [customLabels, setCustomLabels] = useState<CustomLabel[]>([])
  const [tradeLabelMap, setTradeLabelMap] = useState<Record<string, string[]>>({})
  const [showLabelsModal, setShowLabelsModal] = useState(false)
  const [labelingTicket, setLabelingTicket] = useState<string | null>(null)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [player, setPlayer] = useState<{ username: string; avatar_url: string | null; avatar_bg: string | null } | null>(null)
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [defaultAvatars, setDefaultAvatars] = useState<string[]>([])
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [draftAvatarUrl, setDraftAvatarUrl] = useState('')
  const [draftAvatarBg, setDraftAvatarBg] = useState('')

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

  // Timeline expand/collapse
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  // Timeline filters (persisted to localStorage)
  const [hideWeekends, setHideWeekends] = useState<boolean>(() => {
    try { return localStorage.getItem('tj_hideWeekends') !== 'false' } catch { return true }
  })
  const [onlyTradeDays, setOnlyTradeDays] = useState<boolean>(() => {
    try { return localStorage.getItem('tj_onlyTradeDays') === 'true' } catch { return false }
  })

  function toggleHideWeekends() {
    setHideWeekends(v => { const next = !v; try { localStorage.setItem('tj_hideWeekends', String(next)) } catch {} return next })
  }
  function toggleOnlyTradeDays() {
    setOnlyTradeDays(v => { const next = !v; try { localStorage.setItem('tj_onlyTradeDays', String(next)) } catch {} return next })
  }

  // Journal entries + open panel
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalPanel, setJournalPanel] = useState<string | null>(null) // dateKey

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

  // Load player profile (for header avatar)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('players').select('username, avatar_url, avatar_bg').eq('id', user.id).single()
        .then(({ data }) => { if (data) setPlayer(data) })
    })
  }, [])

  // ── Edit Profile ──────────────────────────────────────────────────

  async function openEditProfileModal() {
    setDraftAvatarUrl(player?.avatar_url ?? '')
    setDraftAvatarBg(player?.avatar_bg ?? AVATAR_BG_COLORS[0]!)
    setAvatarError('')
    setShowEditProfileModal(true)
    if (defaultAvatars.length > 0) return
    setAvatarLoading(true)
    const { data, error } = await supabase.storage.from('Avatar').list('', { limit: 100, offset: 0 })
    if (error) {
      setAvatarError(`Không tải được danh sách avatar: ${error.message}`)
    } else if (data) {
      setDefaultAvatars(
        (data as { name: string }[])
          .map(f => f.name)
          .filter(n => n.startsWith('avatar') && n.endsWith('.png'))
          .sort()
      )
    }
    setAvatarLoading(false)
  }

  async function handleAvatarUploadForProfile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true); setAvatarError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAvatarUploading(false); return }
    const path = `users/${user.id}/${Date.now()}.png`
    const { error } = await supabase.storage.from('Avatar').upload(path, file, { upsert: true, contentType: file.type })
    if (error) {
      setAvatarError(`Upload thất bại: ${error.message}`)
    } else {
      const { data: { publicUrl } } = supabase.storage.from('Avatar').getPublicUrl(path)
      setDraftAvatarUrl(publicUrl)
    }
    setAvatarUploading(false)
  }

  async function saveProfileAvatar() {
    setAvatarSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAvatarSaving(false); return }
    await supabase.from('players').update({ avatar_url: draftAvatarUrl, avatar_bg: draftAvatarBg }).eq('id', user.id)
    setPlayer(p => p ? { ...p, avatar_url: draftAvatarUrl, avatar_bg: draftAvatarBg } : p)
    setAvatarSaving(false)
    setShowEditProfileModal(false)
  }

  // ── Delete Account ─────────────────────────────────────────────────

  async function handleDeleteAccount() {
    if (!selectedId || !selectedAccount) return
    setIsDeleting(true)
    const deletedName = selectedAccount.display_name ?? selectedAccount.account_code
    try {
      await Promise.all([
        supabase.from('rule_violations').delete().eq('account_id', selectedId),
        supabase.from('trading_history').delete().eq('account_id', selectedId),
        supabase.from('trading_deposits').delete().eq('account_id', selectedId),
        supabase.from('trading_journal_entries').delete().eq('account_id', selectedId),
      ])
      await supabase.from('trading_accounts').delete().eq('id', selectedId)
      const remaining = accounts.filter(a => a.id !== selectedId)
      setAccounts(remaining)
      setShowDeleteAccountModal(false)
      setDeleteConfirmChecked(false)
      if (remaining.length > 0) {
        const nextId = remaining[0]!.id
        setSelectedId(nextId)
        writeSelectedAccountCookie(nextId)
      } else {
        setSelectedId(null)
        setTradeHistory([])
        setViolations([])
        setJournalEntries([])
        setAccountStats(null)
      }
      setUploadToast(`✓ Đã xóa tài khoản ${deletedName}`)
      setTimeout(() => setUploadToast(null), 3000)
    } catch (err) {
      console.error('[deleteAccount]', err)
    } finally {
      setIsDeleting(false)
    }
  }

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

  async function loadJournalEntries(accountId: string) {
    const res = await fetch(`/api/trading-journal/journal?account_id=${accountId}`)
    if (res.ok) setJournalEntries((await res.json()) as JournalEntry[])
  }

  async function syncTradeStats(trades: TradeHistoryRow[], accountId: string) {
    if (trades.length === 0) return
    const byDay = new Map<string, { count: number; pnl: number }>()
    for (const t of trades) {
      const key = getDateKey(t.close_time)
      const cur = byDay.get(key) ?? { count: 0, pnl: 0 }
      cur.count++
      cur.pnl += (t.profit ?? 0) + (t.commission ?? 0)
      byDay.set(key, cur)
    }
    const rows = Array.from(byDay.entries()).map(([date, s]) => ({
      account_id: accountId,
      entry_date: date,
      has_trades: true,
      trade_count: s.count,
      daily_pnl: s.pnl,
    }))
    await supabase
      .from('trading_journal_entries')
      .upsert(rows, { onConflict: 'account_id,entry_date', ignoreDuplicates: false })
    // Reload journal entries to reflect synced stats
    await loadJournalEntries(accountId)
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
      setJournalEntries([])
      return
    }
    const id = selectedAccount.id
    setStatsLoading(true)
    fetchAccountStats(id)
      .then(setAccountStats)
      .catch(() => setAccountStats(null))
      .finally(() => setStatsLoading(false))
    void loadViolations(id)
    void loadJournalEntries(id)
    // Load trades then sync daily stats into journal entries
    ;(async () => {
      setTradeHistory([]) // clear stale data from previous account immediately
      setTradeHistoryLoading(true)
      try {
        const { data, error } = await supabase
          .from('trading_history')
          .select('ticket, type, symbol, open_time, close_time, pips, profit, commission')
          .eq('account_id', id)
          .order('open_time', { ascending: false })
        if (error) console.error('fetchTrades error:', error)
        const rows = (data as TradeHistoryRow[]) ?? []
        setTradeHistory(rows)
        void syncTradeStats(rows, id)
      } finally {
        setTradeHistoryLoading(false)
      }
    })()
  }, [selectedAccount?.id])

  // Load custom labels from localStorage when account changes
  useEffect(() => {
    if (!selectedId) { setCustomLabels([]); setTradeLabelMap({}); return }
    const store = loadLabelStore(selectedId)
    setCustomLabels(store.labels)
    setTradeLabelMap(store.tradeLabelMap)
  }, [selectedId])

  function toggleDay(dateKey: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  // ── Custom labels ─────────────────────────────────────────────────

  function addCustomLabel(label: CustomLabel) {
    const newLabels = [...customLabels, label]
    setCustomLabels(newLabels)
    if (selectedId) saveLabelStore(selectedId, newLabels, tradeLabelMap)
  }
  function deleteCustomLabel(id: string) {
    const newLabels = customLabels.filter(l => l.id !== id)
    const newMap: Record<string, string[]> = {}
    for (const [ticket, ids] of Object.entries(tradeLabelMap)) {
      const filtered = ids.filter(lid => lid !== id)
      if (filtered.length > 0) newMap[ticket] = filtered
    }
    setCustomLabels(newLabels)
    setTradeLabelMap(newMap)
    if (selectedId) saveLabelStore(selectedId, newLabels, newMap)
  }
  function toggleTradeLabel(ticket: string, labelId: string) {
    const current = tradeLabelMap[ticket] ?? []
    const next = current.includes(labelId) ? current.filter(id => id !== labelId) : [...current, labelId]
    const newMap = { ...tradeLabelMap, [ticket]: next }
    setTradeLabelMap(newMap)
    if (selectedId) saveLabelStore(selectedId, customLabels, newMap)
  }

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
      if (res.status === 401) { setError('Phiên đăng nhập hết hạn — vui lòng tải lại trang'); return }
      if (res.status === 422) {
        const data = await res.json()
        setError(data.message ?? 'File không khớp với account đang chọn')
        setAccountSelectorHighlight(true)
        setTimeout(() => setAccountSelectorHighlight(false), 3000)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
      } else {
        setResult(data as UploadResult)
        setUploadSuccess(true)
        // Reload trades and sync journal stats
        const { data: freshTrades } = await supabase
          .from('trading_history')
          .select('ticket, type, symbol, open_time, close_time, pips, profit, commission')
          .eq('account_id', selectedId)
          .order('open_time', { ascending: false })
        const rows = (freshTrades as TradeHistoryRow[]) ?? []
        setTradeHistory(rows)
        void syncTradeStats(rows, selectedId)
        void doRescan(selectedId)
        // Close modal after 2s, then show toast
        setTimeout(() => {
          setShowUploadModal(false)
          setUploadSuccess(false)
          const r = data as UploadResult
          const inserted = r.supabase_inserted
          const dup = r.duplicates_skipped ?? (r.totalParsed - inserted)
          const accName = selectedAccount?.display_name ?? selectedAccount?.account_code ?? 'account'
          const toast = `✅ ${inserted} giao dịch đã sync vào ${accName}` +
            (dup > 0 ? ` · ⚠️ ${dup} trùng đã bỏ qua` : '')
          setUploadToast(toast)
          setTimeout(() => setUploadToast(null), 4000)
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
          <h1 className="text-white text-2xl font-bold">Trading Journal</h1>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-800 transition"
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: player?.avatar_bg ?? '#3b4bc8',
                overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>
                {player?.avatar_url
                  ? <img src={resolveAvatar(player.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span>{player?.username?.[0]?.toUpperCase() ?? '?'}</span>}
              </div>
              <span className="text-gray-300 text-sm max-w-[80px] truncate hidden sm:block">
                {player?.username ?? '…'}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-gray-500 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showProfileDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-44 py-1 overflow-hidden">
                  {([
                    { icon: '👤', label: 'Edit Profile', action: () => { openEditProfileModal(); setShowProfileDropdown(false) } },
                    { icon: '⚙️', label: 'Settings', action: () => { window.location.href = '/trading-journal/settings'; setShowProfileDropdown(false) } },
                    { icon: '🔒', label: 'Lock', action: () => { onLock(); setShowProfileDropdown(false) } },
                    { icon: '🚪', label: 'Đăng xuất', action: () => { onLogout(); setShowProfileDropdown(false) } },
                  ] as { icon: string; label: string; action: () => void }[]).map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition text-left"
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Account bar */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">

          {/* Action row: Account selector + buttons */}
          <div className="flex items-center gap-2 mb-3 flex-wrap sm:flex-nowrap">

            {/* Compact account selector */}
            <div className="relative flex-1 min-w-0">
              <button
                onClick={() => setShowAccountDropdown(v => !v)}
                disabled={loadingAccounts}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border hover:border-gray-500 bg-gray-800 transition w-full min-w-0 disabled:opacity-50 ${
                  accountSelectorHighlight ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-gray-700'
                }`}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: '#5c35d4', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700,
                }}>
                  {selectedAccount?.broker?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="text-gray-200 text-sm font-medium truncate flex-1 text-left">
                  {loadingAccounts ? 'Loading…'
                    : selectedAccount
                      ? `${selectedAccount.display_name ?? selectedAccount.account_code} · ${selectedAccount.broker}`
                      : accounts.length === 0 ? 'Chưa có account' : 'Chọn account'}
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-gray-500 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAccountDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAccountDropdown(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl min-w-full py-1 overflow-hidden">
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => { setSelectedId(acc.id); setResult(null); writeSelectedAccountCookie(acc.id); setShowAccountDropdown(false) }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition text-left ${
                          selectedId === acc.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', background: '#5c35d4', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700,
                        }}>
                          {acc.broker?.[0]?.toUpperCase()}
                        </div>
                        <span className="truncate flex-1">{acc.display_name ?? acc.account_code} · {acc.broker}</span>
                        {selectedId === acc.id && <span className="text-indigo-400 flex-shrink-0">✓</span>}
                      </button>
                    ))}
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      <button
                        onClick={() => { setShowAddModal(true); setShowAccountDropdown(false) }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-indigo-400 hover:bg-gray-700 transition text-left"
                      >
                        + Thêm account
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Account settings gear */}
            {selectedAccount && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowAccountSettings(v => !v)}
                  title="Account settings"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition text-base"
                >
                  ⚙
                </button>
                {showAccountSettings && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAccountSettings(false)} />
                    <div className="absolute left-0 top-full mt-1.5 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-44 py-1 overflow-hidden">
                      <button
                        onClick={() => { setShowAccountSettings(false); setDeleteConfirmChecked(false); setShowDeleteAccountModal(true) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition text-left"
                      >
                        🗑️ Xóa tài khoản này
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Action buttons */}
            <button
              onClick={() => { if (selectedId) { setError(''); setShowUploadModal(true) } }}
              disabled={!selectedId}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition whitespace-nowrap flex-shrink-0"
            >
              📤 Upload CSV
            </button>
            <button
              onClick={() => {
                setActiveView('timeline')
                if (selectedId) setJournalPanel(getDateKey(new Date().toISOString()))
              }}
              disabled={!selectedId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap flex-shrink-0 disabled:opacity-40 ${
                journalPanel && activeView === 'timeline' ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              📓 Daily Journal
            </button>
            <button
              onClick={() => setActiveView(v => v === 'performance' ? 'timeline' : 'performance')}
              disabled={!selectedId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap flex-shrink-0 disabled:opacity-40 ${
                activeView === 'performance' ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              📊 Performance
            </button>
            <button
              onClick={() => { if (selectedId) setShowRulesModal(true) }}
              disabled={!selectedId}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 transition whitespace-nowrap flex-shrink-0 disabled:opacity-40"
            >
              ⚙ Rules
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
          {selectedAccount && activeView === 'timeline' && (
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

        {/* Performance view */}
        {selectedAccount && activeView === 'performance' && (
          <PerformanceView
            tradeHistory={tradeHistory}
            violations={violations}
            customLabels={customLabels}
            tradeLabelMap={tradeLabelMap}
          />
        )}

        {/* Trade History — Timeline */}
        {selectedAccount && activeView === 'timeline' && (() => {
          const allDayGroups = buildDayGroups(tradeHistory, violations, journalEntries)

          // Apply filters
          const dayGroups = allDayGroups.filter(day => {
            const d = new Date(day.dateKey + 'T00:00:00Z')
            const dow = d.getUTCDay() // 0=Sun, 6=Sat
            const isWeekend = dow === 0 || dow === 6
            const hasTrades = day.trades.length > 0
            const journalHasTrades = day.journal?.has_trades === true

            // Weekend filter
            if (hideWeekends && isWeekend) return false

            // Trade-only filter — either real trades OR user manually ticked "Có lệnh hôm nay"
            if (onlyTradeDays) {
              return hasTrades || journalHasTrades
            }

            return true
          })

          // Count trade days (after weekend filter) for the counter badge
          const tradeDayCount = allDayGroups.filter(day => {
            const dow = new Date(day.dateKey + 'T00:00:00Z').getUTCDay()
            if (hideWeekends && (dow === 0 || dow === 6)) return false
            return day.trades.length > 0 || day.journal?.has_trades === true
          }).length

          return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-800 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                  <h2 className="text-white font-semibold">Trade History</h2>
                  <button
                    onClick={() => setShowLabelsModal(true)}
                    title="Quản lý nhãn tùy chỉnh"
                    className="text-gray-500 hover:text-gray-300 text-sm transition"
                  >⚙</button>
                  {customLabels.length > 0 && (
                    <span className="text-gray-600 text-xs">{customLabels.length} nhãn</span>
                  )}
                </div>

                {/* Filter toggles */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={toggleHideWeekends}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                      hideWeekends ? 'text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                    style={hideWeekends ? { background: '#3b4bc8' } : {}}
                  >
                    Ẩn T7 &amp; CN
                  </button>
                  <button
                    onClick={toggleOnlyTradeDays}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                      onlyTradeDays ? 'text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                    style={onlyTradeDays ? { background: '#3b4bc8' } : {}}
                  >
                    Ngày có lệnh: {tradeDayCount}
                  </button>
                </div>

                <span className="text-gray-600 text-xs flex-shrink-0">
                  {tradeHistoryLoading ? 'Loading…'
                    : tradeHistory.length === 0 ? '0 lệnh'
                    : `${tradeHistory.length} lệnh · ${dayGroups.length} ngày`}
                </span>
              </div>

              {tradeHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tradeHistory.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  Chưa có lệnh nào — upload CSV để bắt đầu
                </p>
              ) : (
                <div>
                  {dayGroups.map((day, dayIdx) => {
                    const expanded = expandedDays.has(day.dateKey)
                    const isPositive = day.totalPnl > 0
                    const isNegative = day.totalPnl < 0
                    return (
                      <div key={day.dateKey} className={dayIdx > 0 ? 'border-t border-gray-800' : ''}>

                        {/* ── Day header row ── */}
                        <div className={`flex items-center px-4 py-3 gap-2 ${
                          day.trades.length === 0 ? 'opacity-60' :
                          isNegative ? 'bg-red-900/10' : isPositive ? 'bg-green-900/10' : ''
                        }`}>

                          {/* Chevron + date label + trade count */}
                          <button
                            onClick={() => day.trades.length > 0 && toggleDay(day.dateKey)}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                          >
                            {day.trades.length > 0 ? (
                              <svg
                                className={`w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            ) : (
                              <span className="w-3.5 h-3.5 flex-shrink-0" />
                            )}
                            <span className={`font-medium text-sm truncate ${day.trades.length === 0 ? 'text-gray-500' : 'text-gray-200'}`}>
                              {day.dateLabel}
                            </span>
                            {day.trades.length > 0 && (
                              <span className="text-gray-600 text-xs flex-shrink-0">{day.trades.length} lệnh</span>
                            )}
                          </button>

                          {/* Right section */}
                          <div className="flex items-center gap-2 flex-shrink-0">

                            {/* Journal indicator */}
                            {day.journal?.lessons_learned ? (
                              <span className="hidden sm:flex items-center gap-1 text-xs text-indigo-400 max-w-[160px]">
                                <span>📝</span>
                                <span className="truncate">{day.journal.lessons_learned.slice(0, 30)}</span>
                              </span>
                            ) : day.trades.length === 0 && !day.journal ? (
                              <span className="hidden sm:inline text-xs text-gray-700 italic">Chưa có ghi chú</span>
                            ) : null}

                            {/* Confidence dots */}
                            {day.journal?.confidence_score != null && (
                              <span className="hidden md:flex gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <span key={n} className={`text-xs ${n <= day.journal!.confidence_score! ? 'text-yellow-400' : 'text-gray-700'}`}>●</span>
                                ))}
                              </span>
                            )}

                            {/* Top 3 violation codes */}
                            {day.topCodes.map(c => (
                              <span key={c.code} className={`hidden md:inline-block px-1.5 py-0.5 rounded font-mono text-xs ${
                                c.severity === 'critical' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300'
                              }`}>{c.code}</span>
                            ))}

                            {/* Severity counts */}
                            {(day.criticalCount > 0 || day.warningCount > 0) && (
                              <span className="text-xs hidden sm:flex items-center gap-1">
                                {day.criticalCount > 0 && <span className="text-red-400">🔴 {day.criticalCount}</span>}
                                {day.warningCount  > 0 && <span className="text-yellow-400">🟡 {day.warningCount}</span>}
                              </span>
                            )}

                            {/* P&L (only for days with trades) */}
                            {day.trades.length > 0 && (
                              <span className={`font-semibold text-sm tabular-nums w-24 text-right ${
                                isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-gray-500'
                              }`}>
                                {isPositive ? '+' : ''}{day.totalPnl.toFixed(2)}
                              </span>
                            )}

                            {/* Ghi chú button */}
                            <button
                              onClick={e => { e.stopPropagation(); setJournalPanel(day.dateKey) }}
                              className={`text-xs transition whitespace-nowrap px-2 py-0.5 rounded ${
                                day.journal
                                  ? 'text-indigo-400 hover:text-indigo-300'
                                  : 'text-gray-600 hover:text-gray-400'
                              }`}
                            >
                              {day.journal ? '✏ Sửa' : '+ Ghi chú'}
                            </button>
                          </div>
                        </div>

                        {/* ── Expanded trade rows ── */}
                        <div
                          className="overflow-hidden"
                          style={{
                            maxHeight: expanded ? `${day.trades.length * 56 + 48}px` : '0px',
                            transition: 'max-height 0.25s ease-in-out',
                          }}
                        >
                          <div className="border-t border-gray-800/60 bg-gray-950/40 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-800/60">
                                  {['Ticket', 'Type', 'Symbol', 'Mở', 'Đóng', 'Pips', 'Profit', 'Violations'].map(h => (
                                    <th key={h} className="px-4 py-2 text-left text-gray-600 font-medium whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {day.trades.map(t => {
                                  const tradeViolations = violations.filter(v => v.ticket === t.ticket)
                                  const isBuy = t.type.toLowerCase() === 'buy'
                                  const isProfit = t.profit >= 0
                                  return (
                                    <tr key={t.ticket} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition">
                                      <td className="px-4 py-2.5 font-mono text-gray-400">{t.ticket}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`px-1.5 py-0.5 rounded font-semibold ${
                                          isBuy ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
                                        }`}>{t.type.toUpperCase()}</span>
                                      </td>
                                      <td className="px-4 py-2.5 text-gray-300 font-medium">{t.symbol}</td>
                                      <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{fmtTime(t.open_time)}</td>
                                      <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{fmtTime(t.close_time)}</td>
                                      <td className="px-4 py-2.5 text-gray-400">{t.pips}</td>
                                      <td className={`px-4 py-2.5 font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                        {isProfit ? '+' : ''}{Number(t.profit).toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <div className="flex flex-wrap items-center gap-1">
                                          {tradeViolations.map(v => (
                                            <ViolationBadge key={v.id} violation={v} onDelete={handleDeleteViolation} />
                                          ))}
                                          {/* Custom label badges */}
                                          {(tradeLabelMap[t.ticket] ?? []).map(lid => {
                                            const lbl = customLabels.find(l => l.id === lid)
                                            if (!lbl) return null
                                            return (
                                              <span key={lid}
                                                onClick={() => toggleTradeLabel(t.ticket, lid)}
                                                className="px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer"
                                                style={{ background: lbl.color + '30', color: lbl.color, border: `1px solid ${lbl.color}60` }}
                                                title={`${lbl.colorName} — click để bỏ`}>
                                                {lbl.name}
                                              </span>
                                            )
                                          })}
                                          {/* Add violation */}
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
                                            className="w-5 h-5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center transition flex-shrink-0"
                                            title="Tag violation"
                                          >
                                            ＋
                                          </button>
                                          {/* Add label */}
                                          {customLabels.length > 0 && (
                                            <div className="relative flex-shrink-0">
                                              <button
                                                onClick={() => setLabelingTicket(labelingTicket === t.ticket ? null : t.ticket)}
                                                className="w-5 h-5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center transition text-xs"
                                                title="Gắn nhãn"
                                              >🏷</button>
                                              {labelingTicket === t.ticket && (
                                                <>
                                                  <div className="fixed inset-0 z-40" onClick={() => setLabelingTicket(null)} />
                                                  <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-48 py-1 overflow-hidden">
                                                    {customLabels.map(lbl => {
                                                      const applied = (tradeLabelMap[t.ticket] ?? []).includes(lbl.id)
                                                      return (
                                                        <button key={lbl.id}
                                                          onClick={() => toggleTradeLabel(t.ticket, lbl.id)}
                                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-700 transition">
                                                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: lbl.color }} />
                                                          <span className="flex-1 truncate" style={{ color: lbl.color }}>{lbl.name}</span>
                                                          {applied && <span className="text-gray-400">✓</span>}
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
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

      {/* Journal panel */}
      {journalPanel && selectedAccount && (() => {
        const day = buildDayGroups(tradeHistory, violations, journalEntries)
          .find(d => d.dateKey === journalPanel)
        const dateLabel = day?.dateLabel ?? formatDayLabel(journalPanel)
        return (
          <JournalPanel
            dateKey={journalPanel}
            dateLabel={dateLabel}
            accountId={selectedAccount.id}
            onClose={() => setJournalPanel(null)}
            onSaved={saved => {
              setJournalEntries(prev => {
                const idx = prev.findIndex(j => j.entry_date === saved.entry_date)
                return idx >= 0
                  ? prev.map((j, i) => i === idx ? saved : j)
                  : [...prev, saved]
              })
            }}
          />
        )
      })()}

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

      {/* Custom Labels Modal */}
      {showLabelsModal && (
        <CustomLabelsModal
          labels={customLabels}
          onClose={() => setShowLabelsModal(false)}
          onAdd={addCustomLabel}
          onDelete={deleteCustomLabel}
        />
      )}

      {/* Rules Modal */}
      {showRulesModal && selectedId && (
        <RulesModal
          accountId={selectedId}
          accounts={accounts}
          onClose={() => setShowRulesModal(false)}
        />
      )}

      {/* ── Edit Profile Modal ── */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-0 sm:pb-4"
          onClick={() => setShowEditProfileModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-white font-bold text-base">Tùy chỉnh hồ sơ</h2>
              <button onClick={() => setShowEditProfileModal(false)} className="text-gray-500 hover:text-white text-xl leading-none transition">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Preview */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-bold shadow-md"
                  style={{ background: draftAvatarBg || AVATAR_BG_COLORS[0] }}>
                  {draftAvatarUrl
                    ? <img src={resolveAvatar(draftAvatarUrl)} alt="" className="w-full h-full object-cover" />
                    : <span>{player?.username?.[0]?.toUpperCase()}</span>}
                </div>
              </div>
              {/* Màu nền */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Màu nền</p>
                <div className="flex gap-2 flex-wrap">
                  {AVATAR_BG_COLORS.map(c => (
                    <button key={c} onClick={() => setDraftAvatarBg(c)}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, outline: draftAvatarBg === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>
              {avatarError && (
                <div className="bg-red-950 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-400">{avatarError}</div>
              )}
              {/* Avatar mặc định */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Avatar mặc định</p>
                {avatarLoading ? (
                  <p className="text-center text-gray-500 text-sm py-4">Đang tải...</p>
                ) : defaultAvatars.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">Không có avatar</p>
                ) : (
                  <div className="grid grid-cols-7 gap-1.5">
                    {defaultAvatars.map(filename => (
                      <button key={filename} onClick={() => setDraftAvatarUrl(filename)}
                        className="rounded-full overflow-hidden aspect-square transition-transform hover:scale-110"
                        style={{ width: 44, height: 44, outline: draftAvatarUrl === filename ? '3px solid #3b4bc8' : 'none', outlineOffset: '2px' }}>
                        <img src={`${AVATAR_BASE}/${filename}`} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Upload */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ảnh tùy chỉnh</p>
                <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border border-dashed transition w-fit text-sm ${
                  avatarUploading ? 'border-indigo-500 text-indigo-400' : 'border-gray-600 text-gray-400 hover:border-indigo-500 hover:text-indigo-400'
                }`}>
                  <span>{avatarUploading ? '⏳' : '📷'}</span>
                  <span>{avatarUploading ? 'Đang upload...' : 'Upload ảnh'}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={avatarUploading} onChange={handleAvatarUploadForProfile} />
                </label>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-800 flex-shrink-0">
              <button onClick={() => setShowEditProfileModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 font-semibold hover:border-gray-600 transition">
                Hủy
              </button>
              <button onClick={saveProfileAvatar} disabled={avatarSaving}
                className="flex-1 py-2 rounded-xl text-white text-sm font-bold transition disabled:opacity-60"
                style={{ background: '#3b4bc8' }}>
                {avatarSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ── */}
      {showDeleteAccountModal && selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => !isDeleting && setShowDeleteAccountModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}>
            {/* Warning icon + title */}
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-5xl">⚠️</span>
              <h3 className="text-red-400 text-xl font-bold">Xóa tài khoản?</h3>
              <p className="text-gray-200 font-semibold text-sm">
                {selectedAccount.display_name ?? selectedAccount.account_code} · {selectedAccount.broker}
              </p>
            </div>
            {/* Warning text */}
            <p className="text-gray-400 text-sm text-center leading-relaxed">
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu giao dịch,
              vi phạm và journal của tài khoản này sẽ bị xóa vĩnh viễn.
            </p>
            {/* Checkbox confirm */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={deleteConfirmChecked}
                  onChange={e => setDeleteConfirmChecked(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                  deleteConfirmChecked ? 'bg-red-600 border-red-600' : 'border-gray-600 group-hover:border-gray-500'
                }`}>
                  {deleteConfirmChecked && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-gray-400 text-xs leading-relaxed">
                Tôi hiểu rằng dữ liệu sẽ bị xóa vĩnh viễn và không thể khôi phục
              </span>
            </label>
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteAccountModal(false); setDeleteConfirmChecked(false) }}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 text-sm font-semibold hover:border-gray-600 transition disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!deleteConfirmChecked || isDeleting}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition"
                style={{ background: '#dc2626', opacity: (!deleteConfirmChecked || isDeleting) ? 0.4 : 1, cursor: (!deleteConfirmChecked || isDeleting) ? 'not-allowed' : 'pointer' }}
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                    Đang xóa…
                  </span>
                ) : 'Xóa tài khoản'}
              </button>
            </div>
          </div>
        </div>
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
