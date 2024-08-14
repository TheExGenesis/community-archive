import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '.env') })
}
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Supabase URL and key must be provided in environment variables',
  )
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

describe('Database Permissions Tests', () => {
  const mockAccount = {
    created_via: 'web',
    username: 'testuser',
    account_id: '999',
    created_at: '2023-01-01T00:00:00+00:00',
    account_display_name: 'Test User',
  }

  beforeAll(async () => {
    // Clear test data and add mock account
    await supabaseAdmin.from('dev_account').delete().neq('account_id', '0')
    const { data, error } = await supabaseAdmin
      .from('dev_account')
      .insert(mockAccount)
  })

  afterAll(async () => {
    // Clear test data
    await supabaseAdmin
      .from('dev_account')
      .delete()
      .eq('account_id', mockAccount.account_id)
  })

  test('Anon user can read from dev_account', async () => {
    const { data, error } = await supabase.from('dev_account').select('*')
    console.log('data', data)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject(mockAccount)
  })

  test('Anon user cannot write to dev_account', async () => {
    const newAccount = {
      ...mockAccount,
      account_id: '1000',
      username: 'newuser',
    }

    const { data, error } = await supabase
      .from('dev_account')
      .insert(newAccount)

    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  test('Service role can write to dev_account', async () => {
    const newAccount = {
      ...mockAccount,
      account_id: '1001',
      username: 'serviceuser',
    }

    const { data, error } = await supabaseAdmin
      .from('dev_account')
      .insert(newAccount)
      .select()

    expect(error).toBeNull()
    expect(data).not.toBeNull()

    // Clean up the inserted data
    await supabaseAdmin
      .from('dev_account')
      .delete()
      .eq('account_id', newAccount.account_id)
  })
})
