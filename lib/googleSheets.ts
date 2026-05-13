import { google } from 'googleapis'

const SHEET_NAME = 'Trades'
const HEADERS = [
  'Date', 'Ticket', 'Type', 'Volume', 'Symbol',
  'Open Price', 'Close Price', 'SL', 'TP',
  'Open Time', 'Close Time', 'Pips', 'Profit',
  'Commission', 'Duration (min)', 'Session', 'RR Ratio',
]

export interface Trade {
  ticket: string
  openTime: string
  closeTime: string
  type: string
  volume: number
  symbol: string
  openPrice: number
  closePrice: number
  sl: number
  tp: number
  swap: number
  commission: number
  profit: number
  pips: number
  durationSeconds: number
}

// FTMO open time is UTC. Convert to GMT+7 and bucket into session.
function getSession(openTime: string): string {
  // Format: "2024.01.15 10:30:00"
  const timePart = openTime.split(' ')[1] ?? '00:00:00'
  const utcHour = parseInt(timePart.split(':')[0] ?? '0', 10)
  const gmt7Hour = (utcHour + 7) % 24
  if (gmt7Hour < 9) return 'Asian'
  if (gmt7Hour < 15) return 'European'
  return 'US'
}

function getRRRatio(type: string, open: number, close: number, sl: number): string {
  const isBuy = type.toLowerCase() === 'buy'
  const risk = isBuy ? open - sl : sl - open
  if (risk <= 0) return 'N/A'
  const reward = isBuy ? close - open : open - close
  return (reward / risk).toFixed(2)
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

async function ensureSheet(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    })
  }
}

export async function appendTrades(trades: Trade[]): Promise<number> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!

  await ensureSheet(sheets, spreadsheetId)

  // Fetch columns A and B to check header + existing tickets
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:B`,
  })
  const rows = existing.data.values ?? []

  // Write headers if sheet is empty
  if (rows.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    })
  }

  // Collect existing ticket numbers (column B, skip header row)
  const existingTickets = new Set(rows.slice(1).map(r => r[1]))

  const newRows = trades
    .filter(t => t.ticket && !existingTickets.has(t.ticket))
    .map(t => {
      const date = t.openTime.split(' ')[0]?.replace(/\./g, '-') ?? ''
      return [
        date,
        t.ticket,
        t.type,
        t.volume,
        t.symbol,
        t.openPrice,
        t.closePrice,
        t.sl,
        t.tp,
        t.openTime,
        t.closeTime,
        t.pips,
        t.profit,
        t.commission,
        (t.durationSeconds / 60).toFixed(1),
        getSession(t.openTime),
        getRRRatio(t.type, t.openPrice, t.closePrice, t.sl),
      ]
    })

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: newRows },
    })
  }

  return newRows.length
}
