import { getServerSupabase } from './supabaseServer'

// ── Types ─────────────────────────────────────────────────────────

export type RuleConfig = {
  timeframe: string
  r_size_pct: number
  max_trades_day: number
  min_rr: number
  min_hold_tf: number        // multiplier of timeframe
  max_hold_tf: number
  allowed_sessions: string[]
  allow_weekend: boolean
  max_consec_loss: number
  revenge_window_min: number
  news_buffer_min: number
  rules_enabled: Record<string, boolean>
}

const TF_MINUTES: Record<string, number> = {
  '1m': 1, '5m': 5, '15m': 15, '30m': 30,
  '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
}

export type ParsedTrade = {
  ticket: string
  open: string        // FTMO format "2024.01.15 10:30:00"
  close: string
  type: string        // "buy" | "sell"
  symbol: string
  volume: number
  openPrice: number
  closePrice: number
  sl: number
  tp: number
  pips: number
  profit: number
  commission: number
  swap: number
  session: string
  rrRatio: number     // 0 if undefined/invalid
  durationMin: number
}

export type ViolationResult = {
  ticket: string
  rule_id: string
  code: string
  severity: string
  auto_note: string
}

type TradingRule = {
  id: string
  code: string
  name: string
  category: string
  severity: string
  detect_type: string
  is_active: boolean
  params: Record<string, number>
}

// ── Helpers ───────────────────────────────────────────────────────

function ftmsToDate(t: string): Date {
  const [date = '', time = '00:00:00'] = t.split(' ')
  return new Date(`${date.replace(/\./g, '-')}T${time}Z`)
}

function getDateStr(t: string): string {
  return t.split(' ')[0] ?? ''
}

// ── Rule Engine ───────────────────────────────────────────────────

export async function runRuleEngine(
  trades: ParsedTrade[],
  accountId: string,
  accountBalance: number,
  config?: RuleConfig | null,
): Promise<ViolationResult[]> {
  console.log('Rule engine input:', {
    tradesCount: trades.length,
    accountId,
    accountBalance,
    firstTrade: trades[0] ? JSON.stringify(trades[0]) : 'none',
  })

  const supabase = await getServerSupabase()

  // Fetch auto rules — all when config present (config controls is_active), else only active
  const baseQuery = supabase.from('trading_rules').select('*').eq('detect_type', 'auto')
  const { data: rawRules, error } = config
    ? await baseQuery
    : await baseQuery.eq('is_active', true)

  console.log('Auto rules fetched:', rawRules?.map(r => r.code) ?? [], 'error:', error?.message ?? null)
  if (error || !rawRules || rawRules.length === 0) return []

  const rules = rawRules as TradingRule[]

  // Apply config overrides to params and is_active
  if (config) {
    const tfMin = TF_MINUTES[config.timeframe] ?? 15
    for (const r of rules) {
      // Map SESSION_US → SESSION_VIOLATION for config lookup
      const cfgKey = r.code === 'SESSION_US' ? 'SESSION_VIOLATION' : r.code
      if (cfgKey in config.rules_enabled) r.is_active = config.rules_enabled[cfgKey] ?? false

      switch (r.code) {
        case 'OVERTRADING':   r.params = { ...r.params, max_trades: config.max_trades_day }; break
        case 'RR_LOW':        r.params = { ...r.params, min_rr: config.min_rr }; break
        case 'RISK_HIGH':     r.params = { ...r.params, max_risk_pct: config.r_size_pct * 2 }; break
        case 'RISK_MEDIUM':   r.params = { ...r.params, warn_risk_pct: config.r_size_pct }; break
        case 'HOLD_TOO_LONG': r.params = { ...r.params, max_hours: (config.max_hold_tf * tfMin) / 60 }; break
        case 'HOLD_TOO_SHORT':r.params = { ...r.params, min_minutes: config.min_hold_tf * tfMin }; break
        case 'REVENGE_TRADE': r.params = { ...r.params, minutes: config.revenge_window_min }; break
        case 'CONSEC_LOSS':   r.params = { ...r.params, max_losses: config.max_consec_loss }; break
      }
    }
  }

  const activeRules = config ? rules.filter(r => r.is_active) : rules
  console.log('Active rules after config:', activeRules.map(r => r.code))

  // Fetch account for DD settings
  const { data: account } = await supabase
    .from('trading_accounts')
    .select('daily_dd_pct, total_dd_pct')
    .eq('id', accountId)
    .single()

  const ruleMap: Record<string, TradingRule> = {}
  for (const r of activeRules) ruleMap[r.code] = r

  // Sort trades by open time ascending
  const sorted = [...trades].sort(
    (a, b) => ftmsToDate(a.open).getTime() - ftmsToDate(b.open).getTime(),
  )

  const violations: ViolationResult[] = []
  const seen = new Set<string>() // dedup by ticket+rule_id

  function addViolation(ticket: string, rule: TradingRule, note: string) {
    const key = `${ticket}:${rule.id}`
    if (seen.has(key)) return
    seen.add(key)
    violations.push({ ticket, rule_id: rule.id, code: rule.code, severity: rule.severity, auto_note: note })
  }

  // Pre-compute groupings for rules that need them
  const byDate: Record<string, ParsedTrade[]> = {}
  for (const t of sorted) {
    const d = getDateStr(t.open)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(t)
  }

  // OVERTRADING — pre-compute before per-trade loop
  const r_overtrading = ruleMap['OVERTRADING']
  if (r_overtrading) {
    for (const [date, dayTrades] of Object.entries(byDate)) {
      const max = r_overtrading.params.max_trades ?? 3
      if (dayTrades.length > max) {
        for (const t of dayTrades) {
          addViolation(t.ticket, r_overtrading, `${dayTrades.length} trades on ${date}, max is ${max}`)
        }
      }
    }
  }

  // DAILY_DD_BREACH — pre-compute
  const r_daily_dd = ruleMap['DAILY_DD_BREACH']
  if (r_daily_dd && account?.daily_dd_pct != null) {
    const limit = accountBalance * (account.daily_dd_pct / 100)
    for (const [date, dayTrades] of Object.entries(byDate)) {
      const dailyPnL = dayTrades.reduce((s, t) => s + t.profit + t.commission, 0)
      if (dailyPnL < -limit) {
        for (const t of dayTrades) {
          addViolation(t.ticket, r_daily_dd, `Daily loss ${Math.abs(dailyPnL).toFixed(2)} exceeds limit ${limit.toFixed(2)} on ${date}`)
        }
      }
    }
  }

  // Per-trade loop
  let streak = 0              // consecutive losses
  let runningBalance = accountBalance

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const prev = i > 0 ? sorted[i - 1] : null

    console.log('Checking trade:', {
      ticket: t.ticket,
      rrRatio: t.rrRatio,
      session: t.session,
      sl: t.sl,
      durationMin: t.durationMin,
      volume: t.volume,
      openPrice: t.openPrice,
      profit: t.profit,
    })

    // RR_LOW
    const r_rr_low = ruleMap['RR_LOW']
    console.log('RR_LOW check:', { rrRatio: t.rrRatio, minRr: r_rr_low?.params.min_rr, wouldFlag: t.rrRatio < (r_rr_low?.params.min_rr ?? 2) && t.rrRatio > 0 })
    if (r_rr_low && t.rrRatio > 0 && t.rrRatio < (r_rr_low.params.min_rr ?? 2)) {
      addViolation(t.ticket, r_rr_low, `RR = ${t.rrRatio.toFixed(2)}, below minimum ${r_rr_low.params.min_rr}`)
    }

    // RR_HIGH
    const r_rr_high = ruleMap['RR_HIGH']
    if (r_rr_high && t.rrRatio > (r_rr_high.params.max_rr ?? 5)) {
      addViolation(t.ticket, r_rr_high, `RR = ${t.rrRatio.toFixed(2)}, above maximum ${r_rr_high.params.max_rr} — possible greed`)
    }

    // NO_SL
    const r_no_sl = ruleMap['NO_SL']
    if (r_no_sl && (!t.sl || t.sl === 0)) {
      addViolation(t.ticket, r_no_sl, `Trade opened without stop loss`)
    }

    // RISK_HIGH / RISK_MEDIUM
    if (t.sl && t.sl !== 0) {
      const r_risk_high = ruleMap['RISK_HIGH']
      const r_risk_med = ruleMap['RISK_MEDIUM']
      const contractSize = r_risk_high?.params.contract_size ?? r_risk_med?.params.contract_size ?? 100000
      const riskAmt = t.volume * Math.abs(t.openPrice - t.sl) * contractSize
      const riskPct = (riskAmt / accountBalance) * 100

      if (r_risk_high && riskPct > (r_risk_high.params.max_risk_pct ?? 2)) {
        addViolation(t.ticket, r_risk_high, `Risk = ${riskPct.toFixed(2)}%, exceeds max ${r_risk_high.params.max_risk_pct}%`)
      } else if (r_risk_med && riskPct > (r_risk_med.params.warn_risk_pct ?? 1)) {
        addViolation(t.ticket, r_risk_med, `Risk = ${riskPct.toFixed(2)}%, above optimal ${r_risk_med.params.warn_risk_pct}%`)
      }
    }

    // SESSION_US / SESSION_VIOLATION
    const r_session = ruleMap['SESSION_US']
    if (r_session) {
      const isViolation = config
        ? !config.allowed_sessions.includes(t.session)  // config-driven: check allowed list
        : t.session === 'US'                             // legacy: only flag US
      if (isViolation) {
        addViolation(t.ticket, r_session, config
          ? `${t.session} session not in allowed sessions [${config.allowed_sessions.join(', ')}]`
          : `Trade opened during US session`)
      }
    }

    // HOLD_TOO_LONG
    const r_long = ruleMap['HOLD_TOO_LONG']
    if (r_long && t.durationMin > (r_long.params.max_hours ?? 24) * 60) {
      addViolation(t.ticket, r_long, `Held for ${(t.durationMin / 60).toFixed(1)}h, max is ${r_long.params.max_hours}h`)
    }

    // HOLD_TOO_SHORT
    const r_short = ruleMap['HOLD_TOO_SHORT']
    if (r_short && t.durationMin < (r_short.params.min_minutes ?? 5)) {
      addViolation(t.ticket, r_short, `Closed after ${t.durationMin.toFixed(0)} min, minimum is ${r_short.params.min_minutes} min`)
    }

    // REVENGE_TRADE
    const r_revenge = ruleMap['REVENGE_TRADE']
    if (r_revenge && prev && prev.profit < 0) {
      const prevClose = ftmsToDate(prev.close)
      const currOpen = ftmsToDate(t.open)
      const minutesDiff = (currOpen.getTime() - prevClose.getTime()) / 60000
      if (minutesDiff >= 0 && minutesDiff < (r_revenge.params.minutes ?? 30)) {
        addViolation(t.ticket, r_revenge, `Opened ${minutesDiff.toFixed(0)} min after previous loss`)
      }
    }

    // CONSEC_LOSS — check streak BEFORE updating it
    const r_consec = ruleMap['CONSEC_LOSS']
    if (r_consec && i > 0 && streak >= (r_consec.params.max_losses ?? 3)) {
      addViolation(t.ticket, r_consec, `Opened after ${streak} consecutive losses`)
    }
    // Update streak
    if (t.profit < 0) streak++
    else streak = 0

    // TOTAL_DD_WARNING — running equity check
    runningBalance += t.profit + t.commission
    const r_total_dd = ruleMap['TOTAL_DD_WARNING']
    if (r_total_dd && account?.total_dd_pct != null) {
      const maxDD = accountBalance * (account.total_dd_pct / 100)
      const threshPct = (r_total_dd.params.threshold_pct ?? 80) / 100
      const warningLevel = accountBalance - maxDD * threshPct
      if (runningBalance < warningLevel) {
        addViolation(t.ticket, r_total_dd, `Equity at ${runningBalance.toFixed(2)}, approaching DD limit`)
      }
    }
  }

  return violations
}

export async function saveViolations(
  violations: ViolationResult[],
  accountId: string,
): Promise<number> {
  if (violations.length === 0) return 0
  const supabase = await getServerSupabase()
  const rows = violations.map(v => ({
    account_id: accountId,
    ticket:    v.ticket,
    rule_id:   v.rule_id,
    severity:  v.severity,
    auto_note: v.auto_note,
  }))
  const { data, error } = await supabase
    .from('rule_violations')
    .upsert(rows, { onConflict: 'account_id,ticket,rule_id', ignoreDuplicates: true })
    .select('ticket')
  if (error) console.error('saveViolations error:', error.message)
  return data?.length ?? 0
}
