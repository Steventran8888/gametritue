import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getServiceSupabase } from '@/lib/supabaseServer'

export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await getServiceSupabase()
    .from('trading_rule_configs')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getServiceSupabase()
    .from('trading_rule_configs')
    .upsert({ ...body, updated_at: new Date().toISOString() }, { onConflict: 'account_id' })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
