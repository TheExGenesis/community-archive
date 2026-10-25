import { getRecentMemberCount } from './recentMembers'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

const previousEnv = process.env
beforeEach(() => {
  process.env = {
    ...previousEnv,
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-key',
    PORTAL_READ_SUPABASE_URL: 'https://production.supabase.co',
    PORTAL_READ_SUPABASE_ANON_KEY: 'production-public-key',
    CLICKHOUSE_ANALYTICS_API_URL: 'https://analytics.example',
  }
})
afterEach(() => {
  process.env = previousEnv
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('counts production portal members in the rolling window even when preview auth uses staging', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-24T12:00:00Z'))
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(null, { headers: { 'content-range': '0-135/136' } }),
  )
  expect(await getRecentMemberCount()).toBe(136)
  const [input, init] = fetchMock.mock.calls[0]
  const url = new URL(String(input))
  expect(url.origin).toBe('https://production.supabase.co')
  expect(url.pathname).toBe('/rest/v1/user_directory')
  expect(url.searchParams.get('and')).toBe(
    '(joined_at.gte.2026-10-23T12:00:00.000Z,joined_at.lte.2026-10-24T12:00:00.000Z)',
  )
  expect(init).toMatchObject({
    method: 'HEAD',
    cache: 'no-store',
    headers: {
      apikey: 'production-public-key',
      Authorization: 'Bearer production-public-key',
      Prefer: 'count=exact',
    },
  })
})

it('preserves a known zero and rejects failed or missing counts', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(null, { headers: { 'content-range': '*/0' } }),
  )
  expect(await getRecentMemberCount()).toBe(0)
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }))
  await expect(getRecentMemberCount()).rejects.toThrow('query failed')
  fetchMock.mockResolvedValue(new Response(null))
  await expect(getRecentMemberCount()).rejects.toThrow('invalid response')
})
