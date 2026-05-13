import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-journal-password')
  if (pw && pw === process.env.JOURNAL_PASSWORD) return true
  const cookie = req.cookies.get('journal_auth')?.value
  return cookie === 'true'
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.is_active !== undefined) update.is_active = body.is_active
  if (body.params !== undefined)    update.params = body.params
  if (body.severity !== undefined)  update.severity = body.severity

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data, error } = await supabase
    .from('trading_rules')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
