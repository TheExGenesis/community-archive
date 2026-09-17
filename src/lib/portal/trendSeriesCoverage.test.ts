import { fetchPortalTrendSeries } from './analytics'
import type { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

type Fetcher = typeof fetchAnalyticsGatewayJson
const now = new Date('2026-09-17T00:01:00Z')
const row = (bucket: string, tweets = '4', totalTweets = '200') => ({
  bucket,
  tweets,
  totalTweets,
  ratePerThousand: 0,
})

test.each([
  ['day', '2026-09-16', '2026-09-17'],
  ['week', '2026-09-07', '2026-09-14'],
  ['month', '2026-08', '2026-09'],
  ['year', '2025', '2026'],
] as const)(
  'trims unobserved %s tails but keeps measured zero matches',
  async (granularity, previous, current) => {
    const timestamp = (key: string) =>
      `${key.length === 4 ? `${key}-01-01` : key.length === 7 ? `${key}-01` : key} 00:00:00.000`
    const fetcher = jest.fn(async () => ({ data: [row(timestamp(previous))] }))
    const missing = await fetchPortalTrendSeries(
      ['alpha'],
      now,
      fetcher as unknown as Fetcher,
      granularity,
    )
    expect(missing.buckets.at(-1)).toBe(previous)
    expect(missing.series[0].tweetsPerBucket.at(-1)).toBe(4)

    fetcher.mockResolvedValue({
      data: [row(timestamp(previous)), row(timestamp(current), '0', '0')],
    })
    const empty = await fetchPortalTrendSeries(
      ['alpha'],
      now,
      fetcher as unknown as Fetcher,
      granularity,
    )
    expect(empty.buckets).toEqual(missing.buckets)

    fetcher.mockResolvedValue({
      data: [row(timestamp(previous)), row(timestamp(current), '0', '200')],
    })
    const measuredZero = await fetchPortalTrendSeries(
      ['alpha'],
      now,
      fetcher as unknown as Fetcher,
      granularity,
    )
    expect(measuredZero.buckets.at(-1)).toBe(current)
    expect(measuredZero.series[0].tweetsPerBucket.at(-1)).toBe(0)
    expect(measuredZero.series[0].perBucket.at(-1)).toBe(0)
  },
)

test('uses a shared observed end date when cached terms have different coverage', async () => {
  const fetcher = jest.fn(async (_path: string[], params: URLSearchParams) => ({
    data: [
      row('2026-09-16 00:00:00.000', params.get('q') === 'alpha' ? '4' : '0'),
      ...(params.get('q') === 'alpha' ? [row('2026-09-17 00:00:00.000')] : []),
    ],
  })) as unknown as Fetcher
  const result = await fetchPortalTrendSeries(
    ['alpha', 'beta'],
    now,
    fetcher,
    'day',
  )
  expect(result.buckets.at(-1)).toBe('2026-09-16')
  expect(result.series.map((series) => series.tweetsPerBucket.at(-1))).toEqual([
    4, 0,
  ])
  for (const series of result.series) {
    expect(series.tweetsPerBucket).toHaveLength(result.buckets.length)
    expect(series.perBucket).toHaveLength(result.buckets.length)
  }
})

test('returns no fabricated points for an empty corpus response or only future data', async () => {
  for (const data of [[], [row('2026-09-18 00:00:00.000')]]) {
    const fetcher = jest.fn(async () => ({ data })) as unknown as Fetcher
    const result = await fetchPortalTrendSeries(['alpha'], now, fetcher, 'day')
    expect(result.buckets).toEqual([])
    expect(result.series[0].tweetsPerBucket).toEqual([])
    expect(result.series[0].perBucket).toEqual([])
  }
})
