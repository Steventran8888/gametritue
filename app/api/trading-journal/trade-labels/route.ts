import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getServiceSupabase } from '@/lib/supabaseServer'

async function verifyAccountOwner(accountId: string, userId: string): Promise<boolean> {
  const { data } = await getServiceSupabase()
    .from('trading_accounts')
    .select('owner_id')
    .eq('id', accountId)
    .single()
  return data?.owner_id === userId
}

export async function GET(req: NextRequest) {
  const url   = new URL(req.url)
  const accountId = url.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const query = getServiceSupabase()
    .from('trade_label_assignments')
    .select('ticket, label_id')
    .eq('account_id', accountId)

  const ticket = url.searchParams.get('ticket')
  const { data, error } = ticket ? await query.eq('ticket', ticket) : await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.account_id || !body?.ticket || !body?.label_id)
    return NextResponse.json({ error: 'account_id, ticket, label_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await verifyAccountOwner(body.account_id, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await getServiceSupabase()
    .from('trade_label_assignments')
    .upsert(
      { account_id: body.account_id, ticket: body.ticket, label_id: body.label_id },
      { onConflict: 'account_id,ticket,label_id', ignoreDuplicates: true },
    )
    .select('ticket, label_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { ticket: body.ticket, label_id: body.label_id })
}

export async function DELETE(req: NextRequest) {
  const url       = new URL(req.url)
  const accountId = url.searchParams.get('account_id')
  const ticket    = url.searchParams.get('ticket')
  const labelId   = url.searchParams.get('label_id')

  if (!accountId || !ticket || !labelId)
    return NextResponse.json({ error: 'account_id, ticket, label_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await verifyAccountOwner(accountId, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await getServiceSupabase()
    .from('trade_label_assignments')
    .delete()
    .eq('account_id', accountId)
    .eq('ticket', ticket)
    .eq('label_id', labelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
