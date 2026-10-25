import { createPublicReadClient, publicDataConfig } from './publicDataSource'

const initialEnv = process.env
const fetchMock = jest.fn()
const originalFetch = global.fetch
beforeEach(() => {
  process.env = {
    ...initialEnv,
    DATA_READ_SOURCE: 'production',
    PORTAL_READ_SUPABASE_URL: 'https://production.example.com',
    PORTAL_READ_SUPABASE_ANON_KEY: 'public-anon-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging.example.com',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-key',
  }
  global.fetch = fetchMock.mockResolvedValue(
    new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})
afterEach(() => {
  process.env = initialEnv
  global.fetch = originalFetch
  jest.clearAllMocks()
})

test('public production reads send only the anonymous key and never a staging session', async () => {
  const result = await createPublicReadClient()
    .from('user_directory')
    .select('username')
  expect(result.error).toBeNull()
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toMatch(
    /^https:\/\/production.example.com\/rest\/v1\/user_directory/,
  )
  expect(new Headers(init.headers).get('authorization')).toBe(
    'Bearer public-anon-key',
  )
  expect(new Headers(init.headers).get('cookie')).toBeNull()
  expect(init.cache).toBe('no-store')
  expect(init.signal).toBeDefined()
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(
    'https://staging.example.com',
  )
})

test('a write cannot reach production even if a caller uses the read client incorrectly', async () => {
  const { error } = await createPublicReadClient()
    .from('optin')
    .insert({ username: 'example' } as never)
  expect(error?.message).toContain('read-only')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('missing production config fails instead of falling back to staging', () => {
  delete process.env.PORTAL_READ_SUPABASE_ANON_KEY
  expect(() => createPublicReadClient()).toThrow('not configured')
})

test('rejects production service keys and partitions shared caches by source', () => {
  const prod = publicDataConfig().sourceId
  process.env.DATA_READ_SOURCE = 'app'
  expect(publicDataConfig().sourceId).not.toBe(prod)
  process.env.DATA_READ_SOURCE = 'production'
  process.env.PORTAL_READ_SUPABASE_ANON_KEY = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
  expect(() => publicDataConfig()).toThrow('anonymous key')
})
