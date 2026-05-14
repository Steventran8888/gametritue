import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabaseServer'

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-journal-password')
  if (pw && pw === process.env.JOURNAL_PASSWORD) return true
  const cookie = req.cookies.get('journal_auth')?.value
  return cookie === 'true'
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountId = req.nextUrl.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const entryDate = req.nextUrl.searchParams.get('entry_date')
  const supabase = await getServerSupabase()

  if (entryDate) {
    const { data, error } = await supabase
      .from('trading_journal_entries')
      .select('*')
      .eq('account_id', accountId)
      .eq('entry_date', entryDate)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? null)
  }

  const { data, error } = await supabase
    .from('trading_journal_entries')
    .select('*')
    .eq('account_id', accountId)
    .order('entry_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { account_id, entry_date } = body
  if (!account_id || !entry_date) {
    return NextResponse.json({ error: 'account_id and entry_date required' }, { status: 400 })
  }

  const supabase = await getServerSupabase()

  const row: Record<string, unknown> = { account_id, entry_date }
  const fields = [
    'has_trades', 'trade_count', 'daily_pnl', 'confidence_score',
    'market_overview', 'strategy_decision', 'setup_reasoning',
    'went_well', 'mistakes_made', 'lessons_learned', 'rule_adjustments',
  ]
  for (const f of fields) {
    if (f in body) row[f] = body[f]
  }

  const { data, error } = await supabase
    .from('trading_journal_entries')
    .upsert(row, { onConflict: 'account_id,entry_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
