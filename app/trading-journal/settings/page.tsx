'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  ACCOUNT_TYPE_PRESETS,
  type TradingAccount,
  type AccountInput,
  getAccounts,
  updateAccount,
  deleteAccount,
} from '@/lib/tradingAccounts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

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
  critical: 'text-red-400 bg-red-950',
  warning:  'text-yellow-400 bg-yellow-950',
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

  const ic = 'w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition'
  const lc = 'text-xs text-gray-400 font-medium mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <div><p className={lc}>DD Type</p><div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400">{ddType || 'None'}</div></div>
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

  if (Object.keys(localParams).length === 0) return <span className="text-gray-600 text-xs">—</span>

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(localParams).map(([key, val]) => (
        <label key={key} className="flex items-center gap-1 text-xs text-gray-400">
          <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
          <input
            type="number"
            defaultValue={String(val)}
            step="any"
            onBlur={e => save(key, e.target.value)}
            className="w-16 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-500"
          />
          {savedKey === key && <span className="text-green-400 text-xs">✓</span>}
        </label>
      ))}
      {saving && <span className="text-xs text-gray-600">saving…</span>}
    </div>
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
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-400 mb-4">Authentication required</p>
          <a href="/trading-journal" className="text-indigo-400 hover:text-indigo-300 text-sm transition">← Back to Journal</a>
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
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Settings</h1>
            <p className="text-gray-500 text-sm mt-0.5">Configure rules and manage accounts</p>
          </div>
          <a href="/trading-journal" className="text-gray-400 hover:text-white text-sm transition">← Back</a>
        </div>

        {/* Rule Configuration */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">Rule Configuration</h2>
          {loadingRules ? (
            <p className="text-gray-500 text-sm">Loading rules…</p>
          ) : rules.length === 0 ? (
            <p className="text-gray-500 text-sm">No rules found in trading_rules table.</p>
          ) : (
            <div className="space-y-5">
              {sortedCategories.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{cat}</p>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium w-10">Active</th>
                          <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Name</th>
                          <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Severity</th>
                          <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Params</th>
                          <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium hidden md:table-cell">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rulesByCategory[cat] ?? []).map(rule => (
                          <tr key={rule.id} className="border-b border-gray-800/50">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleRule(rule)}
                                className={`w-9 h-5 rounded-full transition-colors relative ${rule.is_active ? 'bg-indigo-600' : 'bg-gray-700'}`}
                                aria-label={rule.is_active ? 'Deactivate' : 'Activate'}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.is_active ? 'left-4.5 translate-x-0' : 'left-0.5'}`} />
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-200 font-medium">{rule.name}</p>
                              <p className="text-gray-600 text-xs font-mono">{rule.code}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEV_COLORS[rule.severity] ?? 'text-gray-400 bg-gray-800'}`}>
                                {rule.severity}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {rule.detect_type === 'auto'
                                ? <ParamEditor rule={rule} onUpdated={updated => setRules(prev => prev.map(r => r.id === updated.id ? updated : r))} />
                                : <span className="text-gray-600 text-xs">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
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
            <p className="text-gray-500 text-sm">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">No accounts yet. Add one from the main journal page.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Display Name', 'Broker', 'Code', 'Type', 'Balance', 'Daily DD', 'Total DD', 'Trades', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} className="border-b border-gray-800/50">
                      <td className="px-4 py-3 text-gray-200 font-medium">{acc.display_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400">{acc.broker}</td>
                      <td className="px-4 py-3 font-mono text-gray-400 text-xs">{acc.account_code}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{acc.account_type ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{acc.currency} {acc.initial_balance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-yellow-500 text-xs">{acc.daily_dd_pct != null ? `${acc.daily_dd_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-orange-500 text-xs">{acc.total_dd_pct != null ? `${acc.total_dd_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{tradeCountMap[acc.id] ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingAccount(acc)} className="text-xs text-indigo-400 hover:text-indigo-300 transition">Edit</button>
                          {deleteConfirm === acc.id ? (
                            <>
                              <button onClick={() => handleDelete(acc.id)} className="text-xs text-red-400 hover:text-red-300 transition">Confirm</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300 transition">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(acc.id)} className="text-xs text-gray-600 hover:text-red-400 transition">Delete</button>
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
