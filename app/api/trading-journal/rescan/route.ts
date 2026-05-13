import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabaseServer'
import { runRuleEngine, saveViolations, type ParsedTrade } from '@/lib/ruleEngine'

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-journal-password')
  if (pw && pw === process.env.JOURNAL_PASSWORD) return true
  const cookie = req.cookies.get('journal_auth')?.value
  return cookie === 'true'
}

function isoToFTMO(iso: string): string {
  // "2024-01-15T10:30:00Z" → "2024.01.15 10:30:00"
  const [datePart = '', rest = '00:00:00'] = iso.split('T')
  const timePart = rest.split('.')[0].replace('Z', '')
  return `${datePart.replace(/-/g, '.')} ${timePart}`
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { account_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const accountId = body.account_id
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()

  const [{ data: account }, { data: rows, error: fetchError }] = await Promise.all([
    supabase
      .from('trading_accounts')
      .select('initial_balance, current_balance')
      .eq('id', accountId)
      .single(),
    supabase
      .from('trading_history')
      .select('*')
      .eq('account_id', accountId),
  ])

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ trades_found: 0, violations_found: 0, violations_saved: 0 })
  }

  const balance = account?.current_balance ?? account?.initial_balance ?? 0

  const trades: ParsedTrade[] = rows.map(r => ({
    ticket:     r.ticket,
    open:       isoToFTMO(r.open_time),
    close:      isoToFTMO(r.close_time),
    type:       r.type,
    symbol:     r.symbol,
    volume:     r.volume,
    openPrice:  r.open_price,
    closePrice: r.close_price,
    sl:         r.sl,
    tp:         r.tp,
    pips:       r.pips,
    profit:     r.profit,
    commission: r.commission,
    swap:       r.swap ?? 0,
    session:    r.session,
    rrRatio:    r.rr_ratio ?? 0,
    durationMin: r.duration_min,
  }))

  const violations = await runRuleEngine(trades, accountId, balance)
  const violationsSaved = await saveViolations(violations, accountId)

  console.log(`Rescan ${accountId}: ${rows.length} trades, ${violations.length} violations`)

  return NextResponse.json({
    trades_found:    rows.length,
    violations_found: violations.length,
    violations_saved: violationsSaved,
    violations_by_severity: {
      critical: violations.filter(v => v.severity === 'critical').length,
      warning:  violations.filter(v => v.severity === 'warning').length,
    },
  })
}
