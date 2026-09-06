import { NextRequest } from 'next/server'
import { GET } from '@/app/api/tweet-search/route'

const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    ENABLE_CLICKHOUSE_READS: 'true',
    CLICKHOUSE_ANALYTICS_API_TOKEN: 'fixture-token',
    CLICKHOUSE_SEARCH_API_URL: 'https://gateway.example/search-base/',
  }
})
afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

test('aborts the upstream fetch when the search request is cancelled', async () => {
  const controller = new AbortController()
  let upstreamSignal!: AbortSignal
  jest.spyOn(global, 'fetch').mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        upstreamSignal = options!.signal as AbortSignal
        upstreamSignal.addEventListener('abort', () =>
          reject(new DOMException('Cancelled', 'AbortError')),
        )
      }),
  )
  const pending = GET(
    new NextRequest('https://archive.example/api/tweet-search?q=archive', {
      signal: controller.signal,
    }),
  )
  controller.abort()
  expect(upstreamSignal.aborted).toBe(true)
  expect((await pending).status).toBe(499)
})

test('keeps search responses private and preserves filter forwarding', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response('{"data":{"tweets":[]}}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  const response = await GET(
    new NextRequest(
      'https://archive.example/api/tweet-search?q=archive&from_user=alice&since=2025-01-01&sort=likes&exclude_retweets=true&untrusted=ignored',
    ),
  )
  const target = new URL(String(fetchMock.mock.calls[0][0]))
  expect(target.searchParams.get('from_user')).toBe('alice')
  expect(target.searchParams.get('sort')).toBe('likes')
  expect(target.searchParams.has('untrusted')).toBe(false)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
