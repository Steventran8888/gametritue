import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { appendTrades } from '@/lib/googleSheets'
import { createDailyPages } from '@/lib/notionJournal'
import { runRuleEngine, saveViolations, type ParsedTrade } from '@/lib/ruleEngine'
import type { Trade } from '@/lib/googleSheets'

// ── CSV parsing ───────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function parseCSV(csv: string): Trade[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  return lines
    .slice(1)
    .map(line => parseCSVLine(line))
    .filter(fields => fields.length >= 13 && fields[0] !== '')
    .map(fields => ({
      ticket:          fields[0] ?? '',
      openTime:        fields[1] ?? '',
      type:            fields[2] ?? '',
      volume:          parseFloat(fields[3]  ?? '0') || 0,
      symbol:          fields[4] ?? '',
      openPrice:       parseFloat(fields[5]  ?? '0') || 0,
      sl:              parseFloat(fields[6]  ?? '0') || 0,
      tp:              parseFloat(fields[7]  ?? '0') || 0,
      closeTime:       fields[8] ?? '',
      closePrice:      parseFloat(fields[9]  ?? '0') || 0,
      swap:            parseFloat(fields[10] ?? '0') || 0,
      commission:      parseFloat(fields[11] ?? '0') || 0,
      profit:          parseFloat(fields[12] ?? '0') || 0,
      pips:            parseFloat(fields[13] ?? '0') || 0,
      durationSeconds: parseFloat(fields[14] ?? '0') || 0,
    }))
}

// ── Derived field helpers ─────────────────────────────────────────

function ftmoToISO(t: string): string {
  const [date = '', time = '00:00:00'] = t.split(' ')
  return `${date.replace(/\./g, '-')}T${time}Z`
}

function getSession(openTime: string): string {
  const timePart = openTime.split(' ')[1] ?? '00:00:00'
  const utcHour = parseInt(timePart.split(':')[0] ?? '0', 10)
  const gmt7Hour = (utcHour + 7) % 24
  if (gmt7Hour < 9)  return 'Asian'
  if (gmt7Hour < 15) return 'European'
  return 'US'
}

function getRR(type: string, open: number, close: number, sl: number): number | null {
  const isBuy = type.toLowerCase() === 'buy'
  const risk   = isBuy ? open - sl    : sl - open
  if (risk <= 0) return null
  const reward = isBuy ? close - open : open - close
  return reward / risk
}

function toParsedTrade(t: Trade): ParsedTrade {
  return {
    ticket:      t.ticket,
    open:        t.openTime,
    close:       t.closeTime,
    type:        t.type,
    symbol:      t.symbol,
    volume:      t.volume,
    openPrice:   t.openPrice,
    closePrice:  t.closePrice,
    sl:          t.sl,
    tp:          t.tp,
    pips:        t.pips,
    profit:      t.profit,
    commission:  t.commission,
    swap:        t.swap,
    session:     getSession(t.openTime),
    rrRatio:     getRR(t.type, t.openPrice, t.closePrice, t.sl) ?? 0,
    durationMin: t.durationSeconds / 60,
  }
}

// ── Route ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const pw = req.headers.get('x-journal-password')
  if (!pw || pw !== process.env.JOURNAL_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const accountId = formData.get('account_id') as string | null
  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 })
  }

  const csvText = await file.text()
  const trades  = parseCSV(csvText)

  if (trades.length === 0) {
    return NextResponse.json({ error: 'No valid trades found in CSV' }, { status: 400 })
  }

  // Google Sheets + Notion (unchanged)
  const [tradesAdded, journalPagesCreated] = await Promise.all([
    appendTrades(trades),
    createDailyPages(trades),
  ])

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Supabase: upsert trading_history
  const rows = trades.map(t => ({
    account_id:   accountId,
    ticket:       t.ticket,
    open_time:    ftmoToISO(t.openTime),
    close_time:   ftmoToISO(t.closeTime),
    type:         t.type,
    symbol:       t.symbol,
    volume:       parseFloat(String(t.volume)),
    open_price:   parseFloat(String(t.openPrice)),
    close_price:  parseFloat(String(t.closePrice)),
    sl:           parseFloat(String(t.sl)),
    tp:           parseFloat(String(t.tp)),
    pips:         parseFloat(String(t.pips)),
    profit:       parseFloat(String(t.profit)),
    commission:   parseFloat(String(t.commission)),
    swap:         parseFloat(String(t.swap)) || 0,
    session:      getSession(t.openTime),
    rr_ratio:     parseFloat(String(getRR(t.type, t.openPrice, t.closePrice, t.sl) ?? 0)),
    duration_min: Math.round(t.durationSeconds / 60),
  }))

  const { error: sbError, data: sbData } = await supabase
    .from('trading_history')
    .upsert(rows, { onConflict: 'account_id,ticket', ignoreDuplicates: true })
    .select('ticket')

  if (sbError) console.error('Supabase upsert error:', sbError.message)

  // Fetch account for balance info
  const { data: account } = await supabase
    .from('trading_accounts')
    .select('initial_balance, current_balance')
    .eq('id', accountId)
    .single()

  const balance = account?.current_balance ?? account?.initial_balance ?? 0

  // Rule engine
  const parsedTrades = trades.map(toParsedTrade)
  const violations = await runRuleEngine(parsedTrades, accountId, balance)
  const violationsSaved = await saveViolations(violations, accountId)

  console.log(`Rule engine: ${violations.length} violations found, ${violationsSaved} saved`)

  return NextResponse.json({
    tradesAdded,
    journalPagesCreated,
    totalParsed:        trades.length,
    supabase_inserted:  sbData?.length ?? 0,
    violations_found:   violations.length,
    violations_by_severity: {
      critical: violations.filter(v => v.severity === 'critical').length,
      warning:  violations.filter(v => v.severity === 'warning').length,
    },
    violations: violations.map(v => ({
      ticket:    v.ticket,
      code: v.code,
      severity:  v.severity,
      auto_note: v.auto_note,
    })),
    trades: trades.slice(0, 100),
  })
}
