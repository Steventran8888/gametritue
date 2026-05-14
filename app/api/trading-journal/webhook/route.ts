import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runRuleEngine, saveViolations } from '@/lib/ruleEngine'

// Use service role key — no user session for webhook requests
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key, { auth: { persistSession: false } })
}

function isoToFTMO(iso: string): string {
  const [datePart = '', rest = '00:00:00'] = iso.split('T')
  const timePart = rest.split('.')[0].replace('Z', '')
  return `${datePart.replace(/-/g, '.')} ${timePart}`
}

function getSession(isoTime: string): string {
  try {
    const hour = new Date(isoTime).getUTCHours()
    const gmt7 = (hour + 7) % 24
    if (gmt7 < 9)  return 'Asian'
    if (gmt7 < 15) return 'European'
    return 'US'
  } catch { return 'Unknown' }
}

function getRR(type: string, open: number, close: number, sl: number): number {
  if (!sl || sl === 0) return 0
  const isBuy = type.toLowerCase() === 'buy'
  const risk   = isBuy ? open - sl : sl - open
  if (risk <= 0) return 0
  const reward = isBuy ? close - open : open - close
  return reward / risk
}

interface WebhookBody {
  secret: string
  account_code: string
  event: 'trade_closed' | 'trade_opened' | 'position_modified'
  ticket: number
  symbol: string
  type: string
  volume: number
  open_price: number
  close_price: number
  open_time: string
  close_time: string
  profit: number
  swap?: number
  commission?: number
  pips?: number
  sl?: number
  tp?: number
  comment?: string
  duration_min?: number
}

export async function POST(req: NextRequest) {
  let body: WebhookBody
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 1. Verify webhook secret
  if (!body.secret || body.secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceSupabase()

  // 2. Find trading account by account_code
  const { data: account, error: accError } = await supabase
    .from('trading_accounts')
    .select('id, initial_balance, current_balance')
    .eq('account_code', body.account_code)
    .maybeSingle()

  if (accError) {
    return NextResponse.json({ error: accError.message }, { status: 500 })
  }
  if (!account) {
    return NextResponse.json({ error: `Account not found: ${body.account_code}` }, { status: 404 })
  }

  const accountId = account.id

  // 3. Handle events
  if (body.event === 'trade_closed') {
    const row = {
      account_id:   accountId,
      ticket:       String(body.ticket),
      open_time:    body.open_time,
      close_time:   body.close_time,
      type:         body.type.toLowerCase(),
      symbol:       body.symbol,
      volume:       body.volume,
      open_price:   body.open_price,
      close_price:  body.close_price,
      sl:           body.sl ?? 0,
      tp:           body.tp ?? 0,
      pips:         body.pips ?? 0,
      profit:       body.profit,
      commission:   body.commission ?? 0,
      swap:         body.swap ?? 0,
      session:      getSession(body.open_time),
      rr_ratio:     getRR(body.type, body.open_price, body.close_price, body.sl ?? 0),
      duration_min: body.duration_min ?? 0,
    }

    const { data: inserted, error: upsertError } = await supabase
      .from('trading_history')
      .upsert(row, { onConflict: 'account_id,ticket', ignoreDuplicates: false })
      .select('ticket')
      .single()

    if (upsertError) {
      console.error('[webhook] upsert error:', upsertError.message)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log(`[webhook] trade_closed inserted: ticket=${body.ticket} account=${body.account_code}`)

    // 4. Trigger rule engine for the new trade only
    try {
      const balance = account.current_balance ?? account.initial_balance ?? 0
      const parsedTrade = {
        ticket:      String(body.ticket),
        open:        isoToFTMO(body.open_time),
        close:       isoToFTMO(body.close_time),
        type:        body.type.toLowerCase(),
        symbol:      body.symbol,
        volume:      body.volume,
        openPrice:   body.open_price,
        closePrice:  body.close_price,
        sl:          body.sl ?? 0,
        tp:          body.tp ?? 0,
        pips:        body.pips ?? 0,
        profit:      body.profit,
        commission:  body.commission ?? 0,
        swap:        body.swap ?? 0,
        session:     getSession(body.open_time),
        rrRatio:     getRR(body.type, body.open_price, body.close_price, body.sl ?? 0),
        durationMin: body.duration_min ?? 0,
      }
      const violations = await runRuleEngine([parsedTrade], accountId, balance)
      const saved = await saveViolations(violations, accountId)
      console.log(`[webhook] rule engine: ${violations.length} violations, ${saved} saved`)

      return NextResponse.json({
        success: true,
        trade_id: inserted?.ticket,
        violations_found: violations.length,
      })
    } catch (err) {
      // Rule engine failure is non-fatal
      console.error('[webhook] rule engine error:', err)
      return NextResponse.json({ success: true, trade_id: inserted?.ticket, violations_found: 0 })
    }
  }

  if (body.event === 'trade_opened') {
    console.log(`[webhook] trade_opened: ticket=${body.ticket} symbol=${body.symbol} type=${body.type}`)
    return NextResponse.json({ success: true, event: 'trade_opened', note: 'logged only' })
  }

  if (body.event === 'position_modified') {
    console.log(`[webhook] position_modified: ticket=${body.ticket}`)
    return NextResponse.json({ success: true, event: 'position_modified', note: 'logged only' })
  }

  return NextResponse.json({ error: `Unknown event: ${body.event}` }, { status: 400 })
}
