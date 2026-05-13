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

  const supabase = await getServerSupabase()
  const [{ data: violations, error }, { data: rules }] = await Promise.all([
    supabase
      .from('rule_violations')
      .select('id, ticket, rule_id, auto_note')
      .eq('account_id', accountId),
    supabase
      .from('trading_rules')
      .select('id, code, name, category, severity'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ruleMap = Object.fromEntries((rules ?? []).map(r => [r.id, r]))
  const result = (violations ?? []).map(v => ({
    id: v.id,
    ticket: v.ticket,
    rule_id: v.rule_id,
    auto_note: v.auto_note,
    code: ruleMap[v.rule_id]?.code ?? '',
    rule_name: ruleMap[v.rule_id]?.name ?? '',
    category:  ruleMap[v.rule_id]?.category ?? '',
    severity:  ruleMap[v.rule_id]?.severity ?? 'warning',
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { account_id?: string; ticket?: string; rule_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('POST violations called with:', body)
  const { account_id, ticket, rule_id } = body
  if (!account_id || !ticket || !rule_id) {
    return NextResponse.json({ error: 'account_id, ticket, and rule_id required' }, { status: 400 })
  }

  const supabase = await getServerSupabase()

  const { data: rule, error: ruleError } = await supabase
    .from('trading_rules')
    .select('code, name, category, severity')
    .eq('id', rule_id)
    .single()

  if (ruleError || !rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('rule_violations')
    .upsert(
      { account_id, ticket, rule_id, auto_note: 'Manual tag' },
      { onConflict: 'account_id,ticket,rule_id' },
    )
    .select('id, ticket, rule_id, auto_note')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id:        data.id,
    ticket:    data.ticket,
    rule_id:   data.rule_id,
    auto_note: data.auto_note,
    code: rule.code,
    rule_name: rule.name,
    category:  rule.category,
    severity:  rule.severity,
  })
}
