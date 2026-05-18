'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import {
  ACCOUNT_TYPE_PRESETS,
  type TradingAccount,
  type AccountInput,
  getAccounts,
  updateAccount,
  deleteAccount,
} from '@/lib/tradingAccounts'

// createBrowserClient — session-aware, works with RLS
const supabase = createClient()

// ── Types ─────────────────────────────────────────────────────────

type Rule = {
  id: string
  code: string
  name: string
  category: string
  severity: string
  detect_type: string
  is_active: boolean
  params: Record<string, number | string>
  description: string | null
}

const CATEGORY_ORDER = ['Risk', 'Timing', 'Behavior', 'Drawdown']
const SEV_COLORS: Record<string, string> = {
  critical: 'text-[#f87171] bg-red-950',
  warning:  'text-[#ffc107] bg-yellow-950',
}

// ── Edit Account Modal ────────────────────────────────────────────

function EditAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account: TradingAccount
  onClose: () => void
  onSaved: (a: TradingAccount) => void
}) {
  const presetKeys = Object.keys(ACCOUNT_TYPE_PRESETS)
  const [broker, setBroker] = useState(account.broker)
  const [accountCode, setAccountCode] = useState(account.account_code)
  const [accountType, setAccountType] = useState(account.account_type ?? '')
  const [displayName, setDisplayName] = useState(account.display_name ?? '')
  const [currency, setCurrency] = useState(account.currency)
  const [initialBalance, setInitialBalance] = useState(String(account.initial_balance))
  const [dailyDdPct, setDailyDdPct] = useState(account.daily_dd_pct != null ? String(account.daily_dd_pct) : '')
  const [totalDdPct, setTotalDdPct] = useState(account.total_dd_pct != null ? String(account.total_dd_pct) : '')
  const [ddType, setDdType] = useState(account.dd_type ?? '')
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
    if (!broker.trim() || !accountCode.trim()) { setError('Broker and Account Code required'); return }
    setSaving(true); setError('')
    try {
      const input: Partial<AccountInput> = {
        broker: broker.trim(),
        account_code: accountCode.trim(),
        account_type: accountType || null,
        display_name: displayName.trim() || null,
        currency: currency.trim() || 'USD',
        initial_balance: parseFloat(initialBalance) || 0,
        daily_dd_pct: dailyDdPct ? parseFloat(dailyDdPct) : null,
        total_dd_pct: totalDdPct ? parseFloat(totalDdPct) : null,
        dd_type: ddType || null,
      }
      await updateAccount(account.id, input)
      onSaved({ ...account, ...input } as TradingAccount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const ic = 'w-full bg-[#222840] border border-gray-700 text-white placeholder-[#475569] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#3b4bc8] transition'
  const lc = 'text-xs text-[#94a3b8] font-medium mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-[#1a1f2e] border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base mb-5">Edit Account</h3>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div><p className={lc}>Broker *</p><input list="el-broker" value={broker} onChange={e => setBroker(e.target.value)} className={ic} /><datalist id="el-broker">{['FTMO','Exness','Other'].map(b=><option key={b} value={b}/>)}</datalist></div>
            <div><p className={lc}>Account Code *</p><input value={accountCode} onChange={e => setAccountCode(e.target.value)} className={ic} /></div>
          </div>
          <div><p className={lc}>Account Type</p><select value={accountType} onChange={e => handleTypeChange(e.target.value)} className={ic}>{presetKeys.map(k=><option key={k} value={k}>{k}</option>)}</select></div>
          <div><p className={lc}>Display Name</p><input value={displayName} onChange={e => setDisplayName(e.target.value)} className={ic} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className={lc}>Currency</p><input value={currency} onChange={e => setCurrency(e.target.value)} className={ic} /></div>
            <div><p className={lc}>Initial Balance</p><input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} className={ic} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><p className={lc}>Daily DD %</p><input type="number" step="0.1" value={dailyDdPct} onChange={e => setDailyDdPct(e.target.value)} placeholder="—" className={ic} /></div>
            <div><p className={lc}>Total DD %</p><input type="number" step="0.1" value={totalDdPct} onChange={e => setTotalDdPct(e.target.value)} placeholder="—" className={ic} /></div>
            <div><p className={lc}>DD Type</p><div className="px-3 py-2 bg-[#222840] border border-gray-700 rounded-xl text-sm text-[#94a3b8]">{ddType || 'None'}</div></div>
          </div>
          {error && <p className="text-[#f87171] text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-full border border-gray-700 text-[#94a3b8] text-sm font-semibold hover:border-gray-600 transition">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-full bg-[#3b4bc8] hover:bg-[#6272e0] disabled:opacity-60 text-white text-sm font-semibold transition">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Inline param editor ───────────────────────────────────────────

function ParamEditor({ rule, onUpdated }: { rule: Rule; onUpdated: (r: Rule) => void }) {
  const [localParams, setLocalParams] = useState({ ...rule.params })
  const [saving, setSaving] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  async function save(key: string, value: string) {
    const num = parseFloat(value)
    if (isNaN(num)) return
    const newParams = { ...localParams, [key]: num }
    setLocalParams(newParams)
    setSaving(true)
    try {
      const res = await fetch(`/api/trading-journal/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: newParams, is_active: rule.is_active }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdated(data.rule ?? data)
        setSavedKey(key)
        setTimeout(() => setSavedKey(null), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (Object.keys(localParams).length === 0) return <span className="text-[#475569] text-xs">—</span>

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(localParams).map(([key, val]) => (
        <label key={key} className="flex items-center gap-1 text-xs text-[#94a3b8]">
          <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
          <input
            type="number"
            defaultValue={String(val)}
            step="any"
            onBlur={e => save(key, e.target.value)}
            className="w-16 bg-[#222840] border border-gray-700 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#3b4bc8]"
          />
          {savedKey === key && <span className="text-[#3aaa35] text-xs">✓</span>}
        </label>
      ))}
      {saving && <span className="text-xs text-[#475569]">saving…</span>}
    </div>
  )
}

// ── Method Setup Wizard ───────────────────────────────────────────

type MethodConfig = {
  timeframes: string[]
  riskPct: number
  maxTradesPerDay: number
  allowedSessions: string[]
  minRR: number
  maxConsecLosses: number
  revengeWindow: number
}

type GeneratedRule = {
  code: string
  name: string
  description: string
  threshold?: number
  paramKey?: string
  severity: 'critical' | 'warning'
  enabled: boolean
}

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
const SESSION_OPTIONS   = ['Asian', 'European', 'US']

const DEFAULT_METHOD: MethodConfig = {
  timeframes: ['15m', '1h'],
  riskPct: 1,
  maxTradesPerDay: 3,
  allowedSessions: ['Asian', 'European'],
  minRR: 2,
  maxConsecLosses: 2,
  revengeWindow: 15,
}

function generateRulesFromMethod(m: MethodConfig): GeneratedRule[] {
  return [
    { code: 'OVERTRADING', name: 'Quá số lệnh/ngày',    description: `Không vào quá ${m.maxTradesPerDay} lệnh/ngày`,             threshold: m.maxTradesPerDay,                     paramKey: 'max_trades',    severity: 'critical', enabled: true },
    { code: 'SESSION_US',  name: 'Giao dịch phiên US',  description: 'Giao dịch trong phiên US',                                                                                        severity: 'warning',  enabled: !m.allowedSessions.includes('US') },
    { code: 'RISK_HIGH',   name: 'Risk quá cao',        description: `Risk vượt ${(m.riskPct * 2).toFixed(1)}% balance`,         threshold: parseFloat((m.riskPct * 2).toFixed(2)), paramKey: 'max_risk_pct',  severity: 'critical', enabled: true },
    { code: 'RISK_MEDIUM', name: 'Risk cao',            description: `Risk vượt ${m.riskPct}% balance`,                          threshold: m.riskPct,                             paramKey: 'warn_risk_pct', severity: 'warning',  enabled: true },
    { code: 'RR_LOW',      name: 'RR thấp',             description: `RR dưới 1:${m.minRR}`,                                    threshold: m.minRR,                               paramKey: 'min_rr',        severity: 'warning',  enabled: true },
    { code: 'REVENGE_TRADE', name: 'Revenge trade',     description: `Vào lệnh trong ${m.revengeWindow} phút sau khi thua`,     threshold: m.revengeWindow,                       paramKey: 'minutes',       severity: 'critical', enabled: true },
    { code: 'CONSEC_LOSS', name: 'Thua liên tiếp',      description: `Thua liên tiếp ${m.maxConsecLosses} lệnh`,                threshold: m.maxConsecLosses,                     paramKey: 'max_losses',    severity: 'critical', enabled: true },
    { code: 'NO_SL',       name: 'Không có SL',         description: 'Lệnh không đặt Stop Loss',                                                                                        severity: 'critical', enabled: true },
  ]
}

function MethodSetupWizard({
  rules,
  accounts,
  onRulesUpdated,
}: {
  rules: Rule[]
  accounts: TradingAccount[]
  onRulesUpdated: (rules: Rule[]) => void
}) {
  const [open, setOpen]           = useState(false)
  const [step, setStep]           = useState(1)
  const [method, setMethod]       = useState<MethodConfig>({ ...DEFAULT_METHOD })
  const [wizardRules, setWizardRules] = useState<GeneratedRule[]>([])
  const [saving, setSaving]       = useState(false)
  const [saveResult, setSaveResult] = useState<{ rules: number; accounts: number } | null>(null)

  const ic = 'bg-[#222840] border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#3b4bc8] transition w-full'

  function toggleTF(tf: string) {
    setMethod(m => ({ ...m, timeframes: m.timeframes.includes(tf) ? m.timeframes.filter(x => x !== tf) : [...m.timeframes, tf] }))
  }
  function toggleSession(s: string) {
    setMethod(m => ({ ...m, allowedSessions: m.allowedSessions.includes(s) ? m.allowedSessions.filter(x => x !== s) : [...m.allowedSessions, s] }))
  }
  function toggleWizardRule(code: string) {
    setWizardRules(prev => prev.map(r => r.code === code ? { ...r, enabled: !r.enabled } : r))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updatedList = [...rules]
      let savedCount = 0
      for (const gr of wizardRules) {
        const dbRule = rules.find(r => r.code === gr.code)
        if (!dbRule) continue
        const newParams = gr.paramKey && gr.threshold !== undefined
          ? { ...dbRule.params, [gr.paramKey]: gr.threshold }
          : dbRule.params
        const res = await fetch(`/api/trading-journal/rules/${dbRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: newParams, is_active: gr.enabled }),
        })
        if (res.ok) {
          const data = await res.json()
          const updated: Rule = data.rule ?? data
          const idx = updatedList.findIndex(r => r.id === updated.id)
          if (idx >= 0) updatedList[idx] = updated
          savedCount++
        }
      }
      onRulesUpdated(updatedList)
      let rescanned = 0
      for (const acc of accounts) {
        const res = await fetch('/api/trading-journal/rescan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: acc.id }),
        })
        if (res.ok) rescanned++
      }
      setSaveResult({ rules: savedCount, accounts: rescanned })
      setStep(3)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold text-lg">Phương pháp giao dịch</h2>
          <p className="text-[#475569] text-xs mt-0.5">Cài đặt phương pháp → tự động generate rules</p>
        </div>
        <button
          onClick={() => { setOpen(v => !v); if (!open) { setStep(1); setSaveResult(null) } }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
            open ? 'border-[#3b4bc8] text-[#c7cdff] bg-[#6272e0]/10' : 'border-gray-700 text-[#94a3b8] hover:border-gray-500'
          }`}
        >
          {open ? '▲ Thu gọn' : '⚙ Cài đặt phương pháp'}
        </button>
      </div>

      {open && (
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 space-y-6">
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {([
              { n: 1, label: 'Phương pháp' },
              { n: 2, label: 'Preview rules' },
              { n: 3, label: 'Hoàn tất' },
            ] as { n: number; label: string }[]).map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  step === s.n ? 'bg-[#3b4bc8] text-white' : step > s.n ? 'bg-green-700 text-white' : 'bg-[#222840] text-[#475569]'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className={`text-xs hidden sm:block ${step === s.n ? 'text-[#e2e8f0]' : 'text-[#475569]'}`}>{s.label}</span>
                {i < 2 && <div className="w-8 h-px bg-[#222840] flex-shrink-0" />}
              </div>
            ))}
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-[#94a3b8] font-medium mb-2">Khung thời gian giao dịch</p>
                <div className="flex flex-wrap gap-2">
                  {TIMEFRAME_OPTIONS.map(tf => (
                    <button key={tf} onClick={() => toggleTF(tf)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                        method.timeframes.includes(tf) ? 'bg-[#3b4bc8] text-white' : 'bg-[#222840] text-[#94a3b8] hover:bg-[#2b3350]'
                      }`}>
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {([
                  { label: 'R Size (% balance)', key: 'riskPct',         type: 'float', step: '0.1', min: 0.1, max: 10 },
                  { label: 'Max lệnh/ngày',       key: 'maxTradesPerDay', type: 'int',   step: '1',   min: 1,   max: 20 },
                  { label: 'Min RR (1:X)',         key: 'minRR',           type: 'float', step: '0.5', min: 0.5, max: 10 },
                  { label: 'Max thua liên tiếp',  key: 'maxConsecLosses', type: 'int',   step: '1',   min: 1,   max: 10 },
                  { label: 'Revenge window (phút)',key: 'revengeWindow',  type: 'int',   step: '1',   min: 1,   max: 120 },
                ] as { label: string; key: keyof MethodConfig; type: string; step: string; min: number; max: number }[]).map(f => (
                  <div key={f.key}>
                    <p className="text-xs text-[#94a3b8] font-medium mb-1.5">{f.label}</p>
                    <input
                      type="number" step={f.step} min={f.min} max={f.max}
                      value={method[f.key] as number}
                      onChange={e => {
                        const v = f.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
                        setMethod(m => ({ ...m, [f.key]: isNaN(v) ? f.min : v }))
                      }}
                      className={ic}
                    />
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs text-[#94a3b8] font-medium mb-2">Phiên được phép giao dịch</p>
                <div className="flex gap-3">
                  {SESSION_OPTIONS.map(s => {
                    const allowed = method.allowedSessions.includes(s)
                    return (
                      <button key={s} onClick={() => toggleSession(s)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                          allowed ? 'border-[#3aaa35] text-[#3aaa35] bg-green-900/20' : 'border-gray-700 text-[#475569] bg-[#222840]/50 hover:border-gray-600'
                        }`}>
                        <span>{allowed ? '✓' : '✗'}</span>{s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => { setWizardRules(generateRulesFromMethod(method)); setStep(2) }}
                  className="px-6 py-2.5 rounded-full bg-[#3b4bc8] hover:bg-[#6272e0] text-white text-sm font-semibold transition"
                >
                  Xem preview rules →
                </button>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-[#94a3b8] text-sm">Rules tự động từ phương pháp của bạn. Toggle để bật/tắt từng rule.</p>
              <div className="space-y-2">
                {wizardRules.map(gr => (
                  <div key={gr.code}
                    className={`flex items-start gap-3 p-4 rounded-xl border transition ${
                      gr.enabled ? 'border-gray-700 bg-[#222840]/50' : 'border-gray-800 bg-[#1a1f2e]/30 opacity-50'
                    }`}
                  >
                    <button onClick={() => toggleWizardRule(gr.code)}
                      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5 ${gr.enabled ? 'bg-[#3b4bc8]' : 'bg-[#2b3350]'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${gr.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#e2e8f0] text-sm font-medium">{gr.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          gr.severity === 'critical' ? 'text-[#f87171] bg-red-950' : 'text-[#ffc107] bg-yellow-950'
                        }`}>{gr.severity}</span>
                        {gr.threshold !== undefined && (
                          <span className="text-[#6272e0] text-xs font-mono bg-indigo-950 px-2 py-0.5 rounded">
                            {gr.paramKey}: {gr.threshold}
                          </span>
                        )}
                      </div>
                      <p className="text-[#475569] text-xs mt-0.5">{gr.description}</p>
                      <p className="text-gray-700 text-xs font-mono mt-0.5">{gr.code}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-full border border-gray-700 text-[#94a3b8] text-sm hover:border-gray-600 transition">
                  ← Quay lại
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-6 py-2.5 rounded-full bg-[#3b4bc8] hover:bg-[#6272e0] disabled:opacity-60 text-white text-sm font-semibold transition flex items-center gap-2">
                  {saving
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Đang lưu & rescan…</>
                    : 'Lưu & Rescan tất cả accounts →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && saveResult && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-700 flex items-center justify-center text-3xl">✓</div>
              <div>
                <p className="text-white font-bold text-lg">Hoàn tất!</p>
                <p className="text-[#94a3b8] text-sm mt-1">
                  Đã cập nhật <span className="text-white font-semibold">{saveResult.rules} rules</span> và rescan{' '}
                  <span className="text-white font-semibold">{saveResult.accounts} account{saveResult.accounts !== 1 ? 's' : ''}</span>
                </p>
              </div>
              <button
                onClick={() => { setStep(1); setSaveResult(null); setOpen(false) }}
                className="px-6 py-2 rounded-full bg-[#222840] hover:bg-[#2b3350] text-[#e2e8f0] text-sm font-medium transition"
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Main settings page ────────────────────────────────────────────

export default function SettingsPage() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [rules, setRules] = useState<Rule[]>([])
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [tradeCountMap, setTradeCountMap] = useState<Record<string, number>>({})
  const [editingAccount, setEditingAccount] = useState<TradingAccount | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Auth check
  useEffect(() => {
    const ok = document.cookie.split(';').some(c => c.trim() === 'journal_auth=true')
    setAuthed(ok)
    setChecking(false)
  }, [])

  // Load rules via Supabase browser client
  useEffect(() => {
    if (!authed) return
    ;(async () => {
      try {
        const { data } = await supabase.from('trading_rules').select('*').order('category')
        if (data) setRules(data as Rule[])
      } finally {
        setLoadingRules(false)
      }
    })()
  }, [authed])

  // Load accounts + trade counts per account
  useEffect(() => {
    if (!authed) return
    ;(async () => {
      try {
        const accs = await getAccounts()
        setAccounts(accs)
        // Fetch trade count per account in parallel
        const counts = await Promise.all(
          accs.map(async acc => {
            const { count } = await supabase
              .from('trading_history')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', acc.id)
            return { id: acc.id, count: count ?? 0 }
          }),
        )
        setTradeCountMap(Object.fromEntries(counts.map(c => [c.id, c.count])))
      } finally {
        setLoadingAccounts(false)
      }
    })()
  }, [authed])

  async function toggleRule(rule: Rule) {
    const newActive = !rule.is_active
    const res = await fetch(`/api/trading-journal/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newActive }),
    })
    if (res.ok) {
      const data = await res.json()
      const updated: Rule = data.rule ?? data
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r))
    }
  }

  async function handleDelete(id: string) {
    await deleteAccount(id)
    setAccounts(prev => prev.filter(a => a.id !== id))
    setDeleteConfirm(null)
  }

  if (checking) return null

  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-[#94a3b8] mb-4">Authentication required</p>
          <a href="/trading-journal" className="text-[#6272e0] hover:text-[#c7cdff] text-sm transition">← Back to Journal</a>
        </div>
      </main>
    )
  }

  // Group rules by category
  const rulesByCategory: Record<string, Rule[]> = {}
  for (const r of rules) {
    if (!rulesByCategory[r.category]) rulesByCategory[r.category] = []
    rulesByCategory[r.category].push(r)
  }
  const sortedCategories = [
    ...CATEGORY_ORDER.filter(c => rulesByCategory[c]),
    ...Object.keys(rulesByCategory).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  return (
    <main className="min-h-screen bg-[#0f1117] px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Settings</h1>
            <p className="text-[#475569] text-sm mt-0.5">Configure rules and manage accounts</p>
          </div>
          <a href="/trading-journal" className="text-[#94a3b8] hover:text-white text-sm transition">← Back</a>
        </div>

        {/* Method Setup Wizard */}
        <MethodSetupWizard
          rules={rules}
          accounts={accounts}
          onRulesUpdated={setRules}
        />

        {/* Rule Configuration */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">Rule Configuration</h2>
          {loadingRules ? (
            <p className="text-[#475569] text-sm">Loading rules…</p>
          ) : rules.length === 0 ? (
            <p className="text-[#475569] text-sm">No rules found in trading_rules table.</p>
          ) : (
            <div className="space-y-5">
              {sortedCategories.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-2">{cat}</p>
                  <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="px-4 py-3 text-left text-xs text-[#475569] font-medium w-10">Active</th>
                          <th className="px-4 py-3 text-left text-xs text-[#475569] font-medium">Name</th>
                          <th className="px-4 py-3 text-left text-xs text-[#475569] font-medium">Severity</th>
                          <th className="px-4 py-3 text-left text-xs text-[#475569] font-medium">Params</th>
                          <th className="px-4 py-3 text-left text-xs text-[#475569] font-medium hidden md:table-cell">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rulesByCategory[cat] ?? []).map(rule => (
                          <tr key={rule.id} className="border-b border-gray-800/50">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleRule(rule)}
                                className={`w-9 h-5 rounded-full transition-colors relative ${rule.is_active ? 'bg-[#3b4bc8]' : 'bg-[#2b3350]'}`}
                                aria-label={rule.is_active ? 'Deactivate' : 'Activate'}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.is_active ? 'left-4.5 translate-x-0' : 'left-0.5'}`} />
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-[#e2e8f0] font-medium">{rule.name}</p>
                              <p className="text-[#475569] text-xs font-mono">{rule.code}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEV_COLORS[rule.severity] ?? 'text-[#94a3b8] bg-[#222840]'}`}>
                                {rule.severity}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {rule.detect_type === 'auto'
                                ? <ParamEditor rule={rule} onUpdated={updated => setRules(prev => prev.map(r => r.id === updated.id ? updated : r))} />
                                : <span className="text-[#475569] text-xs">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-[#475569] text-xs hidden md:table-cell">
                              {rule.description ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Account Management */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">Account Management</h2>
          {loadingAccounts ? (
            <p className="text-[#475569] text-sm">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="text-[#475569] text-sm">No accounts yet. Add one from the main journal page.</p>
          ) : (
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Display Name', 'Broker', 'Code', 'Type', 'Balance', 'Daily DD', 'Total DD', 'Trades', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-[#475569] font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} className="border-b border-gray-800/50">
                      <td className="px-4 py-3 text-[#e2e8f0] font-medium">{acc.display_name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#94a3b8]">{acc.broker}</td>
                      <td className="px-4 py-3 font-mono text-[#94a3b8] text-xs">{acc.account_code}</td>
                      <td className="px-4 py-3 text-[#94a3b8] text-xs">{acc.account_type ?? '—'}</td>
                      <td className="px-4 py-3 text-[#94a3b8] text-xs whitespace-nowrap">{acc.currency} {acc.initial_balance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#f7941d] text-xs">{acc.daily_dd_pct != null ? `${acc.daily_dd_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-[#f7941d] text-xs">{acc.total_dd_pct != null ? `${acc.total_dd_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-[#94a3b8] text-xs">{tradeCountMap[acc.id] ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingAccount(acc)} className="text-xs text-[#6272e0] hover:text-[#c7cdff] transition">Edit</button>
                          {deleteConfirm === acc.id ? (
                            <>
                              <button onClick={() => handleDelete(acc.id)} className="text-xs text-[#f87171] hover:text-red-300 transition">Confirm</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs text-[#475569] hover:text-[#e2e8f0] transition">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(acc.id)} className="text-xs text-[#475569] hover:text-[#f87171] transition">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={updated => {
            setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
            setEditingAccount(null)
          }}
        />
      )}
    </main>
  )
}
