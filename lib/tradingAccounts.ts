import { createBrowserClient } from '@supabase/ssr'

function getClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export const ACCOUNT_TYPE_PRESETS: Record<string, {
  daily_dd_pct: number | null
  total_dd_pct: number | null
  dd_type: string | null
}> = {
  'FTMO 1-Step':       { daily_dd_pct: 3,    total_dd_pct: 10, dd_type: 'trailing' },
  'FTMO 2-Step':       { daily_dd_pct: 5,    total_dd_pct: 10, dd_type: 'static'   },
  'Exness Standard':   { daily_dd_pct: null, total_dd_pct: null, dd_type: null     },
  'Exness Pro':        { daily_dd_pct: null, total_dd_pct: null, dd_type: null     },
  'Custom':            { daily_dd_pct: null, total_dd_pct: null, dd_type: null     },
}

export type TradingAccount = {
  id: string
  owner_id?: string
  broker: string
  account_code: string
  account_type: string | null
  display_name: string | null
  currency: string
  initial_balance: number
  current_balance: number | null
  daily_dd_pct: number | null
  total_dd_pct: number | null
  dd_type: string | null
  is_active: boolean
}

export type AccountInput = Omit<TradingAccount, 'id'>

export async function getAccounts(): Promise<TradingAccount[]> {
  const { data, error } = await getClient()
    .from('trading_accounts')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TradingAccount[]
}

export async function createAccount(input: AccountInput): Promise<TradingAccount> {
  const client = getClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await client
    .from('trading_accounts')
    .insert({ ...input, owner_id: user.id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as TradingAccount
}

export async function updateAccount(id: string, input: Partial<AccountInput>): Promise<void> {
  const { error } = await getClient()
    .from('trading_accounts')
    .update(input)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await getClient()
    .from('trading_accounts')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
