import { fetchPortalLiveAnalytics, fetchPortalTrends } from './analytics'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

type AnalyticsFetcher = typeof fetchAnalyticsGatewayJson

describe('ClickHouse-backed portal analytics', () => {
  test('maps canonical summary and observation-time daily stats', async () => {
    const fetcher = jest.fn(async (path: string[]) => {
      if (path[0] === 'summary') {
        return {
          data: {
            memberAccounts: '592',
            totalTweets: '14800000',
            totalLikes: '3200000',
            sourceUpdatedAt: '2026-08-07 11:55:00.000',
            collectedAt: '2026-08-07 12:00:00.000',
          },
        }
      }
      return {
        summary: {
          totalTweets: '1234',
          latestObservedAt: '2026-08-07 11:59:00.000',
          scope: 'firehose',
          countMode: 'unique_tweets_observed',
        },
      }
    }) as unknown as AnalyticsFetcher

    await expect(
      fetchPortalLiveAnalytics(new Date('2026-08-07T12:00:00.000Z'), fetcher),
    ).resolves.toEqual({
      totalTweets: 14_800_000,
      totalLikes: 3_200_000,
      accountCount: 592,
      streamedToday: 1234,
      generatedAt: '2026-08-07T12:00:00.000Z',
      latestObservedAt: '2026-08-07T11:59:00.000Z',
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    const streamCall = (fetcher as jest.Mock).mock.calls.find(
      ([path]) => path[0] === 'stream-stats',
    )
    expect(streamCall?.[1].toString()).toBe(
      'start=2026-08-07T00%3A00%3A00.000Z&end=2026-08-07T12%3A00%3A00.000Z&granularity=hour&scope=firehose',
    )
  })

  test('builds one bounded trend snapshot and distinguishes new from inactive', async () => {
    const fetcher = jest.fn(
      async (_path: string[], params: URLSearchParams) => {
        const term = params.get('q')
        const bucket = params.get('bucket')
        if (bucket === 'year' && term === 'tpot') {
          return {
            data: [
              {
                bucket: '2019-01-01 00:00:00.000',
                tweets: '10',
                totalTweets: '1000',
                ratePerThousand: 10,
              },
              {
                bucket: '2026-01-01 00:00:00.000',
                tweets: '40',
                totalTweets: '2000',
                ratePerThousand: 20,
              },
            ],
          }
        }
        if (bucket === 'day' && term === 'tpot') {
          return {
            data: [
              {
                bucket: '2026-07-27 00:00:00.000',
                tweets: '4',
                totalTweets: '100',
                ratePerThousand: 40,
              },
              {
                bucket: '2026-08-02 00:00:00.000',
                tweets: '8',
                totalTweets: '100',
                ratePerThousand: 80,
              },
            ],
          }
        }
        if (bucket === 'day' && term === 'claude') {
          return {
            data: [
              {
                bucket: '2026-08-03 00:00:00.000',
                tweets: '3',
                totalTweets: '100',
                ratePerThousand: 30,
              },
            ],
          }
        }
        return { data: [] }
      },
    ) as unknown as AnalyticsFetcher

    const trends = await fetchPortalTrends(
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(19)
    expect(trends.years).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ])
    expect(trends.series.find(({ term }) => term === 'tpot')?.perYear).toEqual([
      1000, 0, 0, 0, 0, 0, 0, 2000,
    ])
    expect(trends.weekly.find(({ term }) => term === 'tpot')).toEqual({
      term: 'tpot',
      last7: 8,
      prev7: 4,
      deltaPct: 100,
      status: 'comparable',
    })
    expect(trends.weekly.find(({ term }) => term === 'claude')?.status).toBe(
      'new',
    )
    expect(trends.weekly.find(({ term }) => term === 'jhana')?.status).toBe(
      'inactive',
    )
  })

  test('rejects invalid ClickHouse counts instead of rendering false zeros', async () => {
    const fetcher = jest.fn(async (path: string[]) =>
      path[0] === 'summary'
        ? {
            data: {
              memberAccounts: '592',
              totalTweets: 'not-a-count',
              totalLikes: '3',
              sourceUpdatedAt: '2026-08-07T12:00:00.000Z',
              collectedAt: '2026-08-07T12:00:00.000Z',
            },
          }
        : {
            summary: {
              totalTweets: '1',
              latestObservedAt: null,
              scope: 'firehose',
              countMode: 'unique_tweets_observed',
            },
          },
    ) as unknown as AnalyticsFetcher

    await expect(
      fetchPortalLiveAnalytics(new Date('2026-08-07T12:00:00.000Z'), fetcher),
    ).rejects.toThrow('invalid tweet count')
  })
})
