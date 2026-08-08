import {
  fetchPortalBangersPage,
  fetchPortalTrendEvidence,
  fetchPortalTrendSeries,
  fetchPortalLiveAnalytics,
  fetchPortalHistoricalBangers,
  fetchPortalRecentBangers,
  fetchPortalTrends,
} from './analytics'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

type AnalyticsFetcher = typeof fetchAnalyticsGatewayJson

describe('ClickHouse-backed portal analytics', () => {
  test('maps the canonical summary and rolling 24-hour stream stats', async () => {
    const fetcher = jest.fn(async (path: string[]) => {
      if (path[0] === 'summary') {
        return {
          data: {
            totalTweets: '14800000',
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
      streamedLast24Hours: 1234,
      generatedAt: '2026-08-07T12:00:00.000Z',
      latestObservedAt: '2026-08-07T11:59:00.000Z',
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    const streamCall = (fetcher as jest.Mock).mock.calls.find(
      ([path]) => path[0] === 'stream-stats',
    )
    expect(streamCall?.[1].toString()).toBe(
      'start=2026-08-06T12%3A00%3A00.000Z&end=2026-08-07T12%3A00%3A00.000Z&granularity=hour&scope=firehose',
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
    for (const [, params] of (fetcher as jest.Mock).mock.calls) {
      expect(params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(params.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(trends.years).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ])
    expect(trends.series.find(({ term }) => term === 'tpot')?.perYear).toEqual([
      1000, 0, 0, 0, 0, 0, 0, 2000,
    ])
    expect(
      trends.series.find(({ term }) => term === 'tpot')?.tweetsPerYear,
    ).toEqual([10, 0, 0, 0, 0, 0, 0, 40])
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

  test('fetches several user-selected trend series concurrently', async () => {
    const fetcher = jest.fn(
      async (_path: string[], params: URLSearchParams) => ({
        data: [
          {
            bucket: '2026-01-01 00:00:00.000',
            tweets: params.get('q') === 'alpha' ? '20' : '5',
            totalTweets: '1000',
            ratePerThousand: 0,
          },
        ],
      }),
    ) as unknown as AnalyticsFetcher

    const result = await fetchPortalTrendSeries(
      ['alpha', 'beta'],
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.series).toEqual([
      expect.objectContaining({
        term: 'alpha',
        tweetsPerYear: [0, 0, 0, 0, 0, 0, 0, 20],
        perYear: [0, 0, 0, 0, 0, 0, 0, 2000],
      }),
      expect.objectContaining({
        term: 'beta',
        tweetsPerYear: [0, 0, 0, 0, 0, 0, 0, 5],
        perYear: [0, 0, 0, 0, 0, 0, 0, 500],
      }),
    ])
  })

  test('merges included evidence and removes tweets matching excluded terms', async () => {
    const tweet = (tweetId: string, fullText: string, createdAt: string) => ({
      tweetId,
      accountId: '42',
      createdAt,
      fullText,
      favoriteCount: '3',
      retweetCount: '1',
      username: 'alice',
      accountDisplayName: 'Alice',
      avatarMediaUrl: null,
    })
    const fetcher = jest.fn(
      async (_path: string[], params: URLSearchParams) => ({
        data: {
          tweets:
            params.get('q') === 'alpha'
              ? [
                  tweet(
                    '100',
                    'alpha without the excluded idea',
                    '2026-08-07 10:00:00.000',
                  ),
                  tweet(
                    '101',
                    'alpha and moloch together',
                    '2026-08-07 11:00:00.000',
                  ),
                ]
              : [
                  tweet('102', 'beta arrives later', '2026-08-07 12:00:00.000'),
                  tweet(
                    '100',
                    'alpha without the excluded idea',
                    '2026-08-07 10:00:00.000',
                  ),
                ],
          nextOffset: null,
        },
      }),
    ) as unknown as AnalyticsFetcher

    const result = await fetchPortalTrendEvidence(
      ['alpha', 'beta'],
      ['moloch'],
      30,
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.map(({ id }) => id)).toEqual(['102', '100'])
    expect(result[0]).toMatchObject({
      username: 'alice',
      createdAt: '2026-08-07T12:00:00.000Z',
      likes: 3,
      rts: 1,
    })
  })

  test('rejects invalid ClickHouse counts instead of rendering false zeros', async () => {
    const fetcher = jest.fn(async (path: string[]) =>
      path[0] === 'summary'
        ? {
            data: {
              totalTweets: 'not-a-count',
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

  test('maps recent member bangers and requests the 30-minute cache window', async () => {
    const fetcher = jest.fn(async () => ({
      data: [
        {
          tweetId: '2085365448686866863',
          accountId: '14816854',
          createdAt: '2026-08-06 14:00:41.000',
          fullText: 'A recent banger',
          favoriteCount: '5188',
          retweetCount: '448',
          latestObservedAt: '2026-08-07 03:00:01.000',
          quoteCount: '7',
          username: 'katiebakes',
          accountDisplayName: 'Katie',
          avatarMediaUrl: 'https://pbs.twimg.com/katie.jpg',
        },
      ],
    })) as unknown as AnalyticsFetcher

    await expect(fetchPortalRecentBangers(500, 500, fetcher)).resolves.toEqual([
      {
        id: '2085365448686866863',
        username: 'katiebakes',
        name: 'Katie',
        avatar: 'https://pbs.twimg.com/katie.jpg',
        text: 'A recent banger',
        observedAt: '2026-08-07T03:00:01.000Z',
        createdAt: '2026-08-06T14:00:41.000Z',
        likes: 5188,
        rts: 448,
        quoteCount: 7,
      },
    ])
    expect(fetcher).toHaveBeenCalledWith(
      ['recent-bangers'],
      new URLSearchParams({ limit: '50', hours: '168' }),
      { timeoutMs: 30_000, revalidate: 1_800 },
    )
  })

  test('maps the canonical historical community-quote ranking', async () => {
    const fetcher = jest.fn(async () => ({
      data: [
        {
          tweetId: '123',
          quoteCount: '42',
          accountId: '99',
          username: 'alice',
          displayName: 'Alice',
          createdAt: '2024-08-07 12:00:00.000',
          fullText: 'A historical banger',
          favoriteCount: '500',
          retweetCount: '25',
          avatarMediaUrl: 'https://pbs.twimg.com/alice.jpg',
        },
      ],
    })) as unknown as AnalyticsFetcher

    await expect(fetchPortalHistoricalBangers(500, fetcher)).resolves.toEqual([
      expect.objectContaining({
        id: '123',
        quoteCount: 42,
        createdAt: '2024-08-07T12:00:00.000Z',
        avatar: 'https://pbs.twimg.com/alice.jpg',
      }),
    ])
    expect(fetcher).toHaveBeenCalledWith(
      ['top-quotes'],
      new URLSearchParams({
        limit: '100',
        exclude_self: 'true',
        target_ca_users_only: 'false',
        quote_ca_users_only: 'true',
      }),
      { timeoutMs: 30_000, revalidate: 86_400 },
    )
  })

  test('maps a searched, scoped page with pagination metadata', async () => {
    const fetcher = jest.fn(async () => ({
      data: [
        {
          tweetId: '123',
          quoteCount: '42',
          accountId: '99',
          username: 'alice',
          displayName: 'Alice',
          avatarMediaUrl: null,
          createdAt: '2024-08-07 12:00:00.000',
          fullText: 'A historical banger',
          favoriteCount: '500',
          retweetCount: '25',
        },
      ],
      pagination: {
        limit: 60,
        offset: 5001,
        nextOffset: 5061,
        totalAvailable: 183,
        snapshotSize: 1600,
        yearCounts: [{ year: 2024, count: 22 }],
        candidateRankingTruncated: true,
      },
    })) as unknown as AnalyticsFetcher

    await expect(
      fetchPortalBangersPage(
        {
          offset: 5001,
          sort: 'recent',
          scope: 'members',
          year: 2024,
          query: '  historical  ',
        },
        fetcher,
      ),
    ).resolves.toEqual({
      tweets: [expect.objectContaining({ id: '123', quoteCount: 42 })],
      pagination: {
        limit: 60,
        offset: 5001,
        nextOffset: 5061,
        totalAvailable: 183,
        snapshotSize: 1600,
        yearCounts: [{ year: 2024, count: 22 }],
        candidateRankingTruncated: true,
      },
    })
    expect(fetcher).toHaveBeenCalledWith(
      ['top-quotes'],
      new URLSearchParams({
        limit: '60',
        offset: '5001',
        sort: 'recent',
        exclude_self: 'true',
        target_ca_users_only: 'true',
        quote_ca_users_only: 'true',
        year: '2024',
        q: 'historical',
      }),
      { timeoutMs: 30_000 },
    )
  })
})
