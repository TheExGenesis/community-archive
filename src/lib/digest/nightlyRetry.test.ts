import { publishNightlyDigestWithRetries } from '../../../services/nightly-digest/publish'
import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'
import { generateDigestWithModel } from './openai'
import { AUGUST_11_MOCK_DIGEST } from './mock'

jest.mock('@/lib/portal/analytics', () => ({
  fetchPortalWeeklyTrends: jest.fn(),
}))
jest.mock('./openai', () => ({
  ...jest.requireActual('./openai'),
  generateDigestWithModel: jest.fn(),
}))

const content = { ...AUGUST_11_MOCK_DIGEST.content, digestDate: '2026-10-04' }
const draft = { id: 'edition', status: 'draft', version: 1, content }
const run = {
  id: 'saved-run',
  status: 'completed',
  digest_date: content.digestDate,
  parsed_output: content,
  events: [],
}
const gatewayError = new Error(
  'ClickHouse analytics request failed (502): unavailable',
)
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE,
}
let published: boolean
let requests: Array<{ url: URL; method: string }>

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T06:15:00Z'))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.invalid'
  process.env.SUPABASE_SERVICE_ROLE = 'test-only'
  published = false
  requests = []
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push({ url, method })
    let value: unknown
    if (url.pathname.endsWith('/rpc/publish_digest_edition')) {
      published = true
      value = { ...draft, status: 'published' }
    } else if (method === 'PATCH') {
      value = [draft]
    } else if (url.pathname.endsWith('/digest_runs')) {
      value = [run]
    } else if (url.searchParams.get('status') === 'eq.published') {
      value = published ? [{ ...draft, status: 'published' }] : []
    } else if (url.searchParams.get('status') === 'eq.draft') {
      value = [draft]
    } else {
      throw new Error(`Unexpected request: ${method} ${url.pathname}`)
    }
    return { ok: true, text: async () => JSON.stringify(value) } as Response
  })
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue([
    {
      term: 'up',
      last7: 120,
      prev7: 100,
      deltaPct: 20,
      status: 'comparable',
      sinceDate: '2026-09-27',
      untilDate: '2026-10-03',
    },
    {
      term: 'down',
      last7: 80,
      prev7: 100,
      deltaPct: -20,
      status: 'comparable',
      sinceDate: '2026-09-27',
      untilDate: '2026-10-03',
    },
  ])
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  jest.resetAllMocks()
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: originalEnv.url,
    SUPABASE_SERVICE_ROLE: originalEnv.key,
  })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('recovers a trend 502 from the saved run and draft without another model call', async () => {
  jest.mocked(fetchPortalWeeklyTrends).mockRejectedValueOnce(gatewayError)
  const result = publishNightlyDigestWithRetries()
  await jest.advanceTimersByTimeAsync(59_999)
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(1)
  expect(published).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toMatchObject({ status: 'published' })
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(2)
  expect(generateDigestWithModel).not.toHaveBeenCalled()
  expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(1)
  expect(
    requests.filter(({ url }) => url.pathname.endsWith('/digest_runs')),
  ).toHaveLength(2)
})

test('exhausts two delayed retries and leaves the draft unpublished', async () => {
  jest.mocked(fetchPortalWeeklyTrends).mockRejectedValue(gatewayError)
  const result = publishNightlyDigestWithRetries()
  const assertion = expect(result).rejects.toThrow('502')
  await jest.advanceTimersByTimeAsync(359_999)
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(2)
  await jest.advanceTimersByTimeAsync(1)
  await assertion
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(3)
  expect(published).toBe(false)
  expect(generateDigestWithModel).not.toHaveBeenCalled()
})

test.each([
  'ClickHouse analytics request failed (401): unauthorized',
  'A date-matched rising and falling trend snapshot is unavailable',
])('does not retry a permanent error: %s', async (message) => {
  jest.mocked(fetchPortalWeeklyTrends).mockRejectedValue(new Error(message))
  await expect(publishNightlyDigestWithRetries()).rejects.toThrow(message)
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(1)
  expect(jest.getTimerCount()).toBe(0)
})

test('a publication by another editor during the delay is preserved', async () => {
  jest.mocked(fetchPortalWeeklyTrends).mockRejectedValueOnce(gatewayError)
  const result = publishNightlyDigestWithRetries()
  await jest.advanceTimersByTimeAsync(0)
  published = true
  await jest.advanceTimersByTimeAsync(60_000)
  await expect(result).resolves.toMatchObject({ status: 'already-published' })
  expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(0)
  expect(fetchPortalWeeklyTrends).toHaveBeenCalledTimes(1)
})

test('keeps the original date when a retry crosses the editorial boundary', async () => {
  jest.mocked(fetchPortalWeeklyTrends).mockRejectedValueOnce(gatewayError)
  const result = publishNightlyDigestWithRetries()
  await jest.advanceTimersByTimeAsync(0)
  jest.setSystemTime(new Date('2026-10-05T06:15:00Z'))
  await jest.advanceTimersByTimeAsync(60_000)
  await expect(result).resolves.toMatchObject({ status: 'published' })
  const dates = requests.flatMap(
    ({ url }) => url.searchParams.get('digest_date') ?? [],
  )
  expect(new Set(dates)).toEqual(new Set(['eq.2026-10-04']))
})
