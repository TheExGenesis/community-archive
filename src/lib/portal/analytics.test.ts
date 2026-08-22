import {
  fetchPortalBangersPage,
  fetchPortalDailyInteractions,
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
  test('maps the rolling 24-hour stream stats', async () => {
    const fetcher = jest.fn(async () => {
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
      streamedLast24Hours: 1234,
      latestObservedAt: '2026-08-07T11:59:00.000Z',
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const streamCall = (fetcher as jest.Mock).mock.calls[0]
    expect(streamCall?.[1].toString()).toBe(
      'start=2026-08-06T12%3A00%3A00.000Z&end=2026-08-07T12%3A00%3A00.000Z&granularity=hour&scope=firehose',
    )
  })

  test('combines bounded chart history with community-ranked weekly terms', async () => {
    const fetcher = jest.fn(async (path: string[], params: URLSearchParams) => {
      if (path[0] === 'trending-terms') {
        const emerging = [
          {
            lane: 'emerging',
            term: 'egregore',
            currentTweets: '11',
            currentAuthors: '6',
            baselineTweets: '3',
            expectedTweets: 6,
            tweetDelta: 5,
            changePct: 82.6,
          },
          {
            lane: 'emerging',
            term: 'newterm',
            currentTweets: '10',
            currentAuthors: '4',
            baselineTweets: '0',
            expectedTweets: 0,
            tweetDelta: 10,
            changePct: 100,
          },
        ]
        return {
          data: emerging,
          lanes: {
            emerging,
            rising: [
              {
                lane: 'rising',
                term: 'claude',
                currentTweets: '150',
                currentAuthors: '42',
                baselineTweets: '320',
                expectedTweets: 100,
                tweetDelta: 50,
                changePct: 50,
              },
            ],
            falling: [
              {
                lane: 'falling',
                term: 'alignment',
                currentTweets: '50',
                currentAuthors: '18',
                baselineTweets: '320',
                expectedTweets: 100,
                tweetDelta: -50,
                changePct: -50,
              },
            ],
          },
          query: {
            windowDays: 7,
            baselineDays: 28,
            population: 'community_members',
            countMode: 'unique_tweets_containing_term',
            limit: 2,
          },
        }
      }
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
      return { data: [] }
    }) as unknown as AnalyticsFetcher

    const trends = await fetchPortalTrends(
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(8)
    const trendCalls = (fetcher as jest.Mock).mock.calls.filter(
      ([path]) => path[0] === 'word-trend',
    )
    for (const [, params] of trendCalls) {
      expect(params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(params.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect((fetcher as jest.Mock).mock.calls).toContainEqual([
      ['trending-terms'],
      new URLSearchParams({ limit: '2' }),
      { timeoutMs: 30_000 },
    ])
    expect(trends.years).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ])
    expect(trends.series.find(({ term }) => term === 'tpot')?.perYear).toEqual([
      1000, 0, 0, 0, 0, 0, 0, 2000,
    ])
    expect(
      trends.series.find(({ term }) => term === 'tpot')?.tweetsPerYear,
    ).toEqual([10, 0, 0, 0, 0, 0, 0, 40])
    expect(trends.weekly[0]).toEqual({
      lane: 'emerging',
      term: 'egregore',
      last7: 11,
      baseline28: 3,
      currentAuthors: 6,
      expected7: 6,
      tweetDelta: 5,
      deltaPct: 83,
      status: 'comparable',
    })
    expect(trends.weekly[1]?.status).toBe('new')
    expect(trends.weekly.map(({ lane, term }) => [lane, term])).toEqual([
      ['emerging', 'egregore'],
      ['emerging', 'newterm'],
      ['rising', 'claude'],
      ['falling', 'alignment'],
    ])
  })

  test('fetches several user-selected trend series concurrently', async () => {
    const fetcherMock = jest.fn(
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
    )
    const fetcher = fetcherMock as unknown as AnalyticsFetcher

    const result = await fetchPortalTrendSeries(
      ['alpha', 'beta'],
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.series).toEqual([
      expect.objectContaining({
        term: 'alpha',
        tweetsPerBucket: [0, 0, 0, 0, 0, 0, 0, 20],
        perBucket: [0, 0, 0, 0, 0, 0, 0, 2000],
      }),
      expect.objectContaining({
        term: 'beta',
        tweetsPerBucket: [0, 0, 0, 0, 0, 0, 0, 5],
        perBucket: [0, 0, 0, 0, 0, 0, 0, 500],
      }),
    ])
    expect(result.granularity).toBe('year')
    expect(result.buckets.at(-1)).toBe('2026')
  })

  test('returns bounded monthly buckets for month granularity', async () => {
    const fetcher = jest.fn(async () => ({
      data: [
        {
          bucket: '2026-08-01 00:00:00.000',
          tweets: '4',
          totalTweets: '200',
          ratePerThousand: 0,
        },
      ],
    })) as unknown as AnalyticsFetcher

    const result = await fetchPortalTrendSeries(
      ['alpha'],
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
      'month',
    )

    expect(result.granularity).toBe('month')
    expect(result.buckets[0]).toBe('2019-01')
    expect(result.buckets.at(-1)).toBe('2026-08')
    expect(result.series[0].tweetsPerBucket.at(-1)).toBe(4)
    expect(fetcher).toHaveBeenCalledWith(
      ['word-trend'],
      expect.objectContaining({}),
      { timeoutMs: 30_000 },
    )

    const params = (fetcher as jest.Mock).mock.calls[0][1] as URLSearchParams
    expect(params.get('bucket')).toBe('month')
    expect(params.get('from')).toBe('2019-01-01')
    expect(params.get('to')).toBe('2026-09-01')
  })

  test('caps concurrent trend scans at the two-query gateway budget', async () => {
    let active = 0
    let maxActive = 0
    const fetcher = jest.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return { data: [] }
    }) as unknown as AnalyticsFetcher

    await fetchPortalTrendSeries(
      ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      new Date('2026-08-07T12:00:00.000Z'),
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(maxActive).toBe(2)
  })

  test('merges included evidence and forwards a selected date range', async () => {
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
      media:
        tweetId === '102'
          ? [
              {
                mediaUrl: 'https://pbs.twimg.com/media/evidence.jpg',
                mediaType: 'photo',
                width: 1200,
                height: 800,
              },
            ]
          : [],
    })
    const fetcherMock = jest.fn(
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
                  tweet('101', 'alpha joins in', '2026-08-07 11:00:00.000'),
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
    )
    const fetcher = fetcherMock as unknown as AnalyticsFetcher

    const result = await fetchPortalTrendEvidence(
      ['alpha', 'beta'],
      { limit: 30, since: '2024-01-01', until: '2026-01-01' },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcherMock.mock.calls[0]?.[0]).toEqual(['trend-evidence'])
    expect(result.map(({ id }) => id)).toEqual(['102', '101', '100'])
    expect(fetcherMock.mock.calls[0]?.[1]?.toString()).toContain(
      'since=2024-01-01&until=2026-01-01',
    )
    expect(result[0]).toMatchObject({
      username: 'alice',
      createdAt: '2026-08-07T12:00:00.000Z',
      likes: 3,
      rts: 1,
      media: [
        {
          url: 'https://pbs.twimg.com/media/evidence.jpg',
          type: 'photo',
          width: 1200,
          height: 800,
        },
      ],
    })
  })

  test('rejects invalid ClickHouse stream counts instead of rendering false zeros', async () => {
    const fetcher = jest.fn(async () => ({
      summary: {
        totalTweets: 'not-a-count',
        latestObservedAt: null,
        scope: 'firehose',
        countMode: 'unique_tweets_observed',
      },
    })) as unknown as AnalyticsFetcher

    await expect(
      fetchPortalLiveAnalytics(new Date('2026-08-07T12:00:00.000Z'), fetcher),
    ).rejects.toThrow('invalid last-24-hours streamed count')
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
        accountId: '14816854',
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
    await fetchPortalRecentBangers(
      50,
      24,
      fetcher,
      '2026-08-12T07:00:00.000Z',
      true,
    )
    expect(fetcher).toHaveBeenLastCalledWith(
      ['recent-bangers'],
      new URLSearchParams({
        limit: '50',
        hours: '24',
        end: '2026-08-12T07:00:00.000Z',
        target_ca_users_only: 'true',
      }),
      { timeoutMs: 30_000, revalidate: 1_800 },
    )
  })

  test('maps same-day CA interaction rankings with the exact window and author scope', async () => {
    const fetcher = jest.fn(async () => ({
      data: [
        {
          tweetId: '2085365448686866863',
          accountId: '14816854',
          createdAt: '2026-08-17 14:00:41.000',
          fullText: 'A same-day discussed post',
          favoriteCount: '12',
          retweetCount: '3',
          latestObservedAt: '2026-08-17 14:00:41.000',
          interactionCount: '8',
          replyCount: '7',
          quoteCount: '1',
          username: 'katiebakes',
          accountDisplayName: 'Katie',
          avatarMediaUrl: null,
        },
      ],
    })) as unknown as AnalyticsFetcher

    await expect(
      fetchPortalDailyInteractions(
        50,
        24,
        fetcher,
        '2026-08-18T06:00:00.000Z',
        true,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: '2085365448686866863',
        interactionCount: 8,
        replyCount: 7,
        quoteCount: 1,
      }),
    ])
    expect(fetcher).toHaveBeenCalledWith(
      ['daily-interactions'],
      new URLSearchParams({
        limit: '50',
        hours: '24',
        end: '2026-08-18T06:00:00.000Z',
        target_ca_users_only: 'true',
      }),
      { timeoutMs: 30_000, revalidate: 300 },
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
          createdAfter: '2024-01-01T00:00:00.000Z',
          createdBefore: '2024-12-31T23:59:59.999Z',
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
        created_after: '2024-01-01T00:00:00.000Z',
        created_before: '2024-12-31T23:59:59.999Z',
        q: 'historical',
      }),
      { timeoutMs: 30_000 },
    )
  })
})
