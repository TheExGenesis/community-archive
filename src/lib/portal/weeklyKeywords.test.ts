import {
  AnalyticsGatewayError,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import { fetchPortalWeeklyTrends } from './analytics'
import {
  mapWeeklyKeywords,
  type WeeklyKeywordsResponse,
} from './weeklyKeywords'

const response: WeeklyKeywordsResponse = {
  population: 'community_members',
  window: {
    endDate: '2026-09-07',
    sinceDate: '2026-08-31',
    untilDate: '2026-09-06',
    previousSinceDate: '2026-08-24',
    previousUntilDate: '2026-08-30',
  },
  data: [
    {
      term: 'ai agents',
      lane: 'emerging',
      currentTweets: 80,
      previousTweets: 0,
      currentAuthors: 20,
      previousAuthors: 0,
      currentPer100k: 200,
      previousPer100k: 0,
      changePct: null,
    },
  ],
}

test('maps discovered terms and complete date windows to the homepage', async () => {
  const fetcher = jest.fn().mockResolvedValue(response)
  const result = await fetchPortalWeeklyTrends(new Date('2026-09-07'), fetcher)
  expect(fetcher).toHaveBeenCalledWith(
    ['weekly-keywords'],
    new URLSearchParams(),
    { timeoutMs: 60000 },
  )
  expect(result).toEqual([
    {
      term: 'ai agents',
      lane: 'emerging',
      last7: 80,
      prev7: 0,
      currentAuthors: 20,
      previousAuthors: 0,
      currentPer100k: 200,
      previousPer100k: 0,
      sinceDate: '2026-08-31',
      untilDate: '2026-09-06',
      deltaPct: null,
      status: 'new',
    },
  ])
})

test('keeps zero-current falling terms and rejects malformed windows and duplicate terms', () => {
  expect(
    mapWeeklyKeywords({
      ...response,
      data: [
        {
          ...response.data[0],
          lane: 'falling',
          currentTweets: 0,
          previousTweets: 100,
          currentAuthors: 0,
          previousAuthors: 15,
          changePct: -100,
        },
      ],
    })[0],
  ).toMatchObject({ last7: 0, status: 'comparable', deltaPct: -100 })
  expect(() =>
    mapWeeklyKeywords({
      ...response,
      window: { ...response.window, sinceDate: '2026-09-01' },
    }),
  ).toThrow('invalid')
  expect(() =>
    mapWeeklyKeywords({
      ...response,
      data: [response.data[0], response.data[0]],
    }),
  ).toThrow('invalid')
})

test('falls back to the watchlist only while the new gateway route is absent', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new AnalyticsGatewayError(404, 'Not found'))
    .mockResolvedValue({ data: [] })
  const terms = await fetchPortalWeeklyTrends(new Date('2026-09-07'), fetcher)
  expect(terms.length).toBeGreaterThan(0)
  expect(terms.every((term) => !term.lane)).toBe(true)
  expect(
    fetcher.mock.calls.slice(1).every((call) => call[0][0] === 'word-trend'),
  ).toBe(true)
  const failed = jest
    .fn()
    .mockRejectedValue(new AnalyticsGatewayError(503, 'busy'))
  await expect(fetchPortalWeeklyTrends(new Date(), failed)).rejects.toThrow(
    '503',
  )
  expect(failed).toHaveBeenCalledTimes(1)
})

test('gateway exposes a structured HTTP status for deployment fallback', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(new Response('missing', { status: 404 }))
  await expect(
    fetchAnalyticsGatewayJson(['weekly-keywords'], new URLSearchParams(), {
      baseUrl: 'https://example.test/analytics',
      token: 'test-token',
      fetchImpl,
    }),
  ).rejects.toMatchObject({ status: 404 })
})

test('rejects invalid shares before using them for bar widths or effect ordering', () => {
  for (const currentPer100k of [-1, NaN, Infinity]) {
    expect(() =>
      mapWeeklyKeywords({
        ...response,
        data: [{ ...response.data[0], currentPer100k }],
      }),
    ).toThrow('invalid')
  }
})
