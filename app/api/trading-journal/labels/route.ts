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
  const accountId = new URL(req.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getServiceSupabase()
    .from('custom_labels')
    .select('id, name, type, color, color_name')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Map color_name → colorName for frontend
  const labels = (data ?? []).map(r => ({
    id:        r.id,
    name:      r.name,
    type:      r.type as 'positive' | 'negative',
    color:     r.color,
    colorName: r.color_name ?? '',
  }))

  return NextResponse.json(labels)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await verifyAccountOwner(body.account_id, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await getServiceSupabase()
    .from('custom_labels')
    .insert({
      account_id: body.account_id,
      name:       body.name,
      type:       body.type,
      color:      body.color,
      color_name: body.color_name,
    })
    .select('id, name, type, color, color_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id:        data.id,
    name:      data.name,
    type:      data.type,
    color:     data.color,
    colorName: data.color_name ?? '',
  })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership via the label's account_id
  const { data: label } = await getServiceSupabase()
    .from('custom_labels')
    .select('account_id')
    .eq('id', id)
    .single()

  if (!label) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await verifyAccountOwner(label.account_id, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await getServiceSupabase()
    .from('custom_labels')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
