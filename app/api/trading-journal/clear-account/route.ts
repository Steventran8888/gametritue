import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getServiceSupabase } from '@/lib/supabaseServer'

export async function DELETE(req: NextRequest) {
  const { account_id } = await req.json().catch(() => ({}))
  if (!account_id) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 })
  }

  // Verify ownership
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('trading_accounts')
    .select('id, owner_id')
    .eq('id', account_id)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (account.owner_id && account.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete all trade data (keep account record itself)
  const service = getServiceSupabase()
  const [r1, r2, r3, r4] = await Promise.all([
    service.from('rule_violations').delete().eq('account_id', account_id),
    service.from('trading_history').delete().eq('account_id', account_id),
    service.from('trading_deposits').delete().eq('account_id', account_id),
    service.from('trading_journal_entries').delete().eq('account_id', account_id),
  ])

  const errors = [r1, r2, r3, r4].map(r => r.error?.message).filter(Boolean)
  if (errors.length > 0) {
    console.error('[clear-account] errors:', errors)
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  console.log('[clear-account] cleared all data for account_id:', account_id)
  return NextResponse.json({ success: true, account_id })
}
