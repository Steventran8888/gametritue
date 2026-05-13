import { NextRequest, NextResponse } from 'next/server'
import { appendTrades } from '@/lib/googleSheets'
import { createDailyPages } from '@/lib/notionJournal'
import type { Trade } from '@/lib/googleSheets'

// Parse a single CSV line respecting quoted fields.
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

// FTMO CSV columns (0-indexed):
// 0:Ticket 1:Open(time) 2:Type 3:Volume 4:Symbol 5:Price(open)
// 6:SL 7:TP 8:Close(time) 9:Price(close) 10:Swap 11:Commissions
// 12:Profit 13:Pips 14:Trade duration in seconds
function parseCSV(csv: string): Trade[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  return lines
    .slice(1) // skip header
    .map(line => parseCSVLine(line))
    .filter(fields => fields.length >= 13 && fields[0] !== '')
    .map(fields => ({
      ticket: fields[0] ?? '',
      openTime: fields[1] ?? '',
      type: fields[2] ?? '',
      volume: parseFloat(fields[3] ?? '0') || 0,
      symbol: fields[4] ?? '',
      openPrice: parseFloat(fields[5] ?? '0') || 0,
      sl: parseFloat(fields[6] ?? '0') || 0,
      tp: parseFloat(fields[7] ?? '0') || 0,
      closeTime: fields[8] ?? '',
      closePrice: parseFloat(fields[9] ?? '0') || 0,
      swap: parseFloat(fields[10] ?? '0') || 0,
      commission: parseFloat(fields[11] ?? '0') || 0,
      profit: parseFloat(fields[12] ?? '0') || 0,
      pips: parseFloat(fields[13] ?? '0') || 0,
      durationSeconds: parseFloat(fields[14] ?? '0') || 0,
    }))
}

export async function POST(req: NextRequest) {
  // Password check
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

  const csvText = await file.text()
  const trades = parseCSV(csvText)

  if (trades.length === 0) {
    return NextResponse.json({ error: 'No valid trades found in CSV' }, { status: 400 })
  }

  const [tradesAdded, journalPagesCreated] = await Promise.all([
    appendTrades(trades),
    createDailyPages(trades),
  ])

  return NextResponse.json({
    tradesAdded,
    journalPagesCreated,
    totalParsed: trades.length,
    trades: trades.slice(0, 100), // preview
  })
}
