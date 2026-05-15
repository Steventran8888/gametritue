import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getServiceSupabase } from '@/lib/supabaseServer'
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

function parseCSVRaw(csv: string): { headers: string[], rows: string[][] } {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0] ?? '').map(h => h.toLowerCase().trim())
  const rows = lines.slice(1).map(line => parseCSVLine(line)).filter(fields => fields.length >= 4 && fields[0] !== '')
  return { headers, rows }
}

function detectBroker(headers: string[], firstRow: string[]): 'ftmo' | 'exness' | 'unknown' {
  const h = headers.join(',').toLowerCase()
  if (h.includes('opening_time_utc') || h.includes('closing_time_utc') || h.includes('original_position_size')) return 'exness'
  if (h.includes('pips') || h.includes('duration')) return 'ftmo'
  if (firstRow.some(f => /^\d{4}\.\d{2}\.\d{2}/.test(f))) return 'ftmo'
  return 'unknown'
}

function parseCSVFTMO(rows: string[][]): Trade[] {
  return rows.filter(fields => fields.length >= 13 && fields[0] !== '').map(fields => ({
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

function parseCSVExness(headers: string[], lines: string[][]): Trade[] {
  const h = headers.map(x => x.toLowerCase().trim())

  const iTicket     = h.indexOf('ticket')
  const iOpenTime   = h.indexOf('opening_time_utc') >= 0 ? h.indexOf('opening_time_utc') : h.findIndex(x => x.includes('open') && x.includes('time'))
  const iCloseTime  = h.indexOf('closing_time_utc') >= 0 ? h.indexOf('closing_time_utc') : h.findIndex(x => x.includes('clos') && x.includes('time'))
  const iType       = h.indexOf('type')
  const iVolume     = h.indexOf('lots') >= 0 ? h.indexOf('lots') : h.indexOf('volume')
  const iSymbol     = h.indexOf('symbol')
  const iOpenPrice  = h.indexOf('opening_price') >= 0 ? h.indexOf('opening_price') : h.findIndex(x => x.includes('open') && x.includes('price'))
  const iClosePrice = h.indexOf('closing_price') >= 0 ? h.indexOf('closing_price') : h.findIndex(x => x.includes('clos') && x.includes('price'))
  const iSL         = h.indexOf('stop_loss') >= 0 ? h.indexOf('stop_loss') : h.indexOf('s/l')
  const iTP         = h.indexOf('take_profit') >= 0 ? h.indexOf('take_profit') : h.indexOf('t/p')
  const iCommission = h.indexOf('commission')
  const iSwap       = h.indexOf('swap')
  const iProfit     = h.indexOf('profit')

  console.log('[upload] Exness column indices:', { iTicket, iOpenTime, iCloseTime, iType, iVolume, iSymbol, iOpenPrice, iClosePrice, iSL, iTP, iCommission, iSwap, iProfit })

  return lines
    .filter(fields => fields.length >= 3 && (fields[0] ?? '') !== '')
    .map(fields => ({
      ticket:          fields[iTicket]     ?? '',
      openTime:        fields[iOpenTime]   ?? '',
      closeTime:       fields[iCloseTime]  ?? '',
      type:            fields[iType]       ?? '',
      volume:          parseFloat(fields[iVolume]     ?? '0') || 0,
      symbol:          fields[iSymbol]     ?? '',
      openPrice:       parseFloat(fields[iOpenPrice]  ?? '0') || 0,
      closePrice:      parseFloat(fields[iClosePrice] ?? '0') || 0,
      sl:              parseFloat(fields[iSL]         ?? '0') || 0,
      tp:              parseFloat(fields[iTP]         ?? '0') || 0,
      commission:      parseFloat(fields[iCommission] ?? '0') || 0,
      swap:            parseFloat(fields[iSwap]       ?? '0') || 0,
      profit:          parseFloat(fields[iProfit]     ?? '0') || 0,
      pips:            0,
      durationSeconds: 0,
    }))
}

// ── Derived field helpers ─────────────────────────────────────────

function parseDateTime(t: string): string {
  if (!t) return new Date().toISOString()
  // FTMO: "2026.05.07 17:18:53"
  if (/^\d{4}\.\d{2}\.\d{2}/.test(t)) {
    const [date, time = '00:00:00'] = t.split(' ')
    return `${date!.replace(/\./g, '-')}T${time}Z`
  }
  // Exness: "2026-05-07T17:18:53" (no Z)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)) return t + 'Z'
  // Already valid ISO (has Z or offset)
  if (t.endsWith('Z') || t.includes('+')) return t
  // Exness space-separated: "2026-04-08 12:38:29"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(t)) return t.replace(' ', 'T') + 'Z'
  return new Date(t).toISOString()
}

function getSession(openTime: string): string {
  const utcHour = openTime.includes('T')
    ? parseInt(openTime.split('T')[1]?.split(':')[0] ?? '0', 10)
    : parseInt(openTime.split(' ')[1]?.split(':')[0] ?? '0', 10)
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

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-journal-password')
  if (pw && pw === process.env.JOURNAL_PASSWORD) return true
  const cookie = req.cookies.get('journal_auth')?.value
  return cookie === 'true'
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
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
  const { headers, rows: csvRows } = parseCSVRaw(csvText)

  if (csvRows.length === 0) {
    return NextResponse.json({ error: 'No valid trades found in CSV' }, { status: 400 })
  }

  const supabase = await getServerSupabase()

  // Verify account belongs to current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[upload] auth.getUser:', user?.id ?? null, '| error:', authError?.message ?? null)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: account, error: accError } = await supabase
    .from('trading_accounts')
    .select('id, owner_id, initial_balance, current_balance, broker')
    .eq('id', accountId)
    .single()

  console.log('[upload] account lookup:', account?.id ?? null, '| owner_id:', account?.owner_id ?? null, '| error:', accError?.message ?? null)

  if (accError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }
  if (account.owner_id && account.owner_id !== user.id) {
    console.error('[upload] 403 — account.owner_id:', account.owner_id, '!== user.id:', user.id)
    return NextResponse.json({ error: 'Forbidden: account does not belong to this user' }, { status: 403 })
  }

  // Detect broker from CSV and validate against account
  const firstRow = csvRows[0] ?? []
  const detectedBroker = detectBroker(headers, firstRow)
  console.log('[upload] detected broker:', detectedBroker, '| account broker:', account.broker)
  console.log('[upload] CSV headers:', JSON.stringify(headers))
  console.log('[upload] CSV first data row:', JSON.stringify(firstRow))

  if (detectedBroker !== 'unknown' && account.broker?.toLowerCase() !== detectedBroker) {
    return NextResponse.json({
      error: 'broker_mismatch',
      message: `File có vẻ là dữ liệu ${detectedBroker.toUpperCase()} nhưng account đang chọn là ${account.broker}. Vui lòng chọn đúng account trước khi upload.`,
      detected_broker: detectedBroker,
      account_broker: account.broker,
    }, { status: 422 })
  }

  const trades = detectedBroker === 'exness'
    ? parseCSVExness(headers, csvRows)
    : parseCSVFTMO(csvRows)

  console.log('[upload] account_id:', accountId, '| parsed trades:', trades.length)
  console.log('[upload] sample tickets:', trades.slice(0, 3).map(t => t.ticket))

  // ── Step 1: pre-check duplicates scoped to THIS account ───────────
  // Use service role to bypass RLS — ownership already verified above
  const serviceSupabase = getServiceSupabase()
  const incomingTickets = trades.map(t => t.ticket)
  const { data: existing, error: existErr } = await serviceSupabase
    .from('trading_history')
    .select('ticket')
    .eq('account_id', accountId)        // ← scoped to THIS account only
    .in('ticket', incomingTickets)

  console.log('[upload] existing tickets in account:', existing?.length ?? 0, '| error:', existErr?.message ?? null)
  if (existing && existing.length > 0) {
    console.log('[upload] existing sample:', existing.slice(0, 3).map(r => r.ticket))
  }

  const existingSet     = new Set(existing?.map(r => r.ticket) ?? [])
  const newTrades       = trades.filter(t => !existingSet.has(t.ticket))
  const duplicatesSkipped = trades.length - newTrades.length

  console.log(`[upload] ${newTrades.length} new trades to insert, ${duplicatesSkipped} duplicates skipped`)

  // Google Sheets + Notion
  const [tradesAdded, journalPagesCreated] = await Promise.all([
    appendTrades(trades),
    createDailyPages(trades),
  ])

  // ── Step 2: insert only new trades ───────────────────────────────
  let supabaseInserted = 0

  if (newTrades.length > 0) {
    const rows = newTrades.map(t => ({
      account_id:   accountId,
      ticket:       t.ticket,
      open_time:    parseDateTime(t.openTime),
      close_time:   parseDateTime(t.closeTime),
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

    console.log('[upload] inserting', rows.length, 'rows | account_id:', accountId)
    console.log('[upload] sample rows:', rows.slice(0, 2).map(r => ({ ticket: r.ticket, account_id: r.account_id, symbol: r.symbol })))

    const { error: sbError, data: sbData } = await serviceSupabase
      .from('trading_history')
      .upsert(rows, { onConflict: 'account_id,ticket', ignoreDuplicates: false })
      .select('ticket')

    console.error('[upload] sbError full:', JSON.stringify({
      message: sbError?.message,
      details: sbError?.details,
      hint:    sbError?.hint,
      code:    sbError?.code,
    }))
    console.error('[upload] first row:', JSON.stringify(rows[0]))
    console.log('[upload] upsert error:', sbError?.message ?? null)
    console.log('[upload] upsert sbData length:', sbData?.length ?? null)

    // Use actual DB count from sbData (service role returns full result)
    supabaseInserted = sbData?.length ?? 0
    console.log('[upload] actual inserted from DB:', supabaseInserted)
  }

  console.log(`[upload] FINAL: ${supabaseInserted} giao dịch mới, ${duplicatesSkipped} trùng bỏ qua, account_id: ${accountId}`)

  const balance = account.current_balance ?? account.initial_balance ?? 0

  // Rule engine
  const parsedTrades = trades.map(toParsedTrade)
  const violations = await runRuleEngine(parsedTrades, accountId, balance)
  const violationsSaved = await saveViolations(violations, accountId)

  console.log(`[upload] rule engine: ${violations.length} violations found, ${violationsSaved} saved`)

  return NextResponse.json({
    tradesAdded,
    journalPagesCreated,
    totalParsed:        trades.length,
    supabase_inserted:  supabaseInserted,
    duplicates_skipped: duplicatesSkipped,
    violations_found:   violations.length,
    violations_by_severity: {
      critical: violations.filter(v => v.severity === 'critical').length,
      warning:  violations.filter(v => v.severity === 'warning').length,
    },
    violations: violations.map(v => ({
      ticket:    v.ticket,
      code:      v.code,
      severity:  v.severity,
      auto_note: v.auto_note,
    })),
    trades: trades.slice(0, 100),
  })
}
