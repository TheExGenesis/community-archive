jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))
jest.mock('./analytics', () => ({
  fetchPortalBangersPage: jest.fn(),
  fetchPortalHistoricalBangers: jest.fn(),
  fetchPortalLiveAnalytics: jest.fn(),
  fetchPortalRecentBangers: jest.fn(),
  fetchPortalTrends: jest.fn(),
}))
jest.mock('./research', () => ({
  getResearchPosts: jest.fn(),
  selectFeaturedResearchPosts: jest.fn((posts: unknown) => posts),
}))

import {
  fetchPortalGlobalStats,
  getInitialPortalBangersPage,
  getPortalBangersPage,
  getPortalData,
  getPortalStreamPage,
  getPortalStreamUpdates,
  enrichPortalTweets,
  loadOptionalPortalData,
  loadPortalComponentData,
  portalDataSourceKey,
  resolvePortalReadConfig,
  selectDailyBangers,
  selectDailyRecentBangers,
} from './data'
import {
  fetchPortalBangersPage,
  fetchPortalHistoricalBangers,
  fetchPortalLiveAnalytics,
  fetchPortalRecentBangers,
  fetchPortalTrends,
} from './analytics'
import { getResearchPosts } from './research'
import type { PortalTweet } from './types'

const fetchPortalHistoricalBangersMock =
  fetchPortalHistoricalBangers as jest.MockedFunction<
    typeof fetchPortalHistoricalBangers
  >
const fetchPortalBangersPageMock =
  fetchPortalBangersPage as jest.MockedFunction<typeof fetchPortalBangersPage>
const fetchPortalLiveAnalyticsMock =
  fetchPortalLiveAnalytics as jest.MockedFunction<
    typeof fetchPortalLiveAnalytics
  >
const fetchPortalRecentBangersMock =
  fetchPortalRecentBangers as jest.MockedFunction<
    typeof fetchPortalRecentBangers
  >
const fetchPortalTrendsMock = fetchPortalTrends as jest.MockedFunction<
  typeof fetchPortalTrends
>
const getResearchPostsMock = getResearchPosts as jest.MockedFunction<
  typeof getResearchPosts
>

describe('portal read source', () => {
  test('uses an explicit server-only row source without changing app Supabase', () => {
    const config = resolvePortalReadConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-anon',
      PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      PORTAL_READ_SUPABASE_ANON_KEY: 'prod-public-anon',
    })

    expect(config).toEqual({
      url: 'https://prod-project.supabase.co',
      anonKey: 'prod-public-anon',
      sourceId: 'prod-project.supabase.co',
    })
  })

  test('requires the read URL and anonymous key together', () => {
    expect(() =>
      resolvePortalReadConfig({
        NODE_ENV: 'production',
        PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      }),
    ).toThrow('must be configured together')
  })

  test('keys caches by deployment, ClickHouse host, and row source', () => {
    const key = portalDataSourceKey({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      CLICKHOUSE_SEARCH_API_URL: 'https://analytics.example',
      PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      PORTAL_READ_SUPABASE_ANON_KEY: 'prod-public-anon',
    })

    expect(key).toBe(
      'portal-v6:preview:analytics.example:prod-project.supabase.co',
    )
  })
})

describe('optional portal data', () => {
  test('reports a component failure while returning its local fallback', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    await expect(
      loadPortalComponentData(
        'trends-explorer',
        async () => {
          throw new Error('Analytics gateway is temporarily unavailable')
        },
        { series: [] },
      ),
    ).resolves.toEqual({ data: { series: [] }, failed: true })

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"section":"trends-explorer"'),
    )
    consoleError.mockRestore()
  })

  test('returns a fallback without rejecting the page when a section fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    await expect(
      loadOptionalPortalData(
        'historical-bangers',
        async () => {
          throw new Error('Analytics gateway is temporarily unavailable')
        },
        [],
      ),
    ).resolves.toEqual([])

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"section":"historical-bangers"'),
    )
    consoleError.mockRestore()
  })
})

describe('portal page resilience', () => {
  const previousEnv = {
    portalUrl: process.env.PORTAL_READ_SUPABASE_URL,
    portalKey: process.env.PORTAL_READ_SUPABASE_ANON_KEY,
    analyticsUrl: process.env.CLICKHOUSE_ANALYTICS_API_URL,
    analyticsToken: process.env.CLICKHOUSE_ANALYTICS_API_TOKEN,
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation()
    process.env.PORTAL_READ_SUPABASE_URL = 'https://prod-project.supabase.co/'
    process.env.PORTAL_READ_SUPABASE_ANON_KEY = 'prod-public-anon'
    process.env.CLICKHOUSE_ANALYTICS_API_URL =
      'https://analytics.community-archive.org/analytics'
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = 'test-token'

    fetchPortalTrendsMock.mockResolvedValue({
      years: [],
      series: [],
      weekly: [],
      computedAt: '2026-08-07T20:00:00.000Z',
    })
    fetchPortalLiveAnalyticsMock.mockResolvedValue({
      streamedLast24Hours: 25,
      latestObservedAt: '2026-08-07T20:00:00.000Z',
    })
    fetchPortalRecentBangersMock.mockResolvedValue([])
    fetchPortalHistoricalBangersMock.mockResolvedValue([])
    getResearchPostsMock.mockResolvedValue([])

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/summary')) {
        return new Response(
          JSON.stringify({
            data: {
              totalTweets: '15334092',
              memberAccounts: '42',
              sourceUpdatedAt: '2026-08-13 18:34:09.903',
              collectedAt: '2026-08-13 18:34:20.907',
              membershipSnapshotAt: '2026-08-13 18:34:00.000',
              source:
                'clickhouse.community_membership_current+corpus_count_current',
              countMode: 'live_membership+cached_unique_tweets_exact',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.pathname.endsWith('/portal-stream')) {
        return new Response('gateway unavailable', { status: 503 })
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-range': '0-0/42' },
        })
      }
      if (url.pathname.endsWith('/tweets')) {
        const createdAt = url.searchParams.get('order')?.endsWith('.asc')
          ? '2007-01-01T00:00:00.000Z'
          : '2026-08-07T00:00:00.000Z'
        return new Response(JSON.stringify([{ created_at: createdAt }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected test request: ${url}`)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    restore('PORTAL_READ_SUPABASE_URL', previousEnv.portalUrl)
    restore('PORTAL_READ_SUPABASE_ANON_KEY', previousEnv.portalKey)
    restore('CLICKHOUSE_ANALYTICS_API_URL', previousEnv.analyticsUrl)
    restore('CLICKHOUSE_ANALYTICS_API_TOKEN', previousEnv.analyticsToken)
  })

  test('keeps the page available when the initial stream request fails', async () => {
    await expect(getPortalData()).resolves.toMatchObject({
      initialStream: [],
      failures: {
        initialStream: true,
        liveAnalytics: false,
        memberCount: false,
        corpusRange: false,
        trends: false,
      },
    })
  })

  test('loads the homepage Banger of the moment from the past 24 hours', async () => {
    await getPortalData()

    expect(fetchPortalRecentBangersMock).toHaveBeenCalledWith(50, 24)
  })

  test('does not load trend analysis for the live stream page', async () => {
    await expect(getPortalData('stream')).resolves.toMatchObject({
      trends: { years: [], series: [], weekly: [], computedAt: '' },
      failures: { trends: false },
    })

    expect(fetchPortalTrendsMock).not.toHaveBeenCalled()
  })

  test('preserves other components when the trends request fails', async () => {
    fetchPortalTrendsMock.mockRejectedValueOnce(
      new Error('trend snapshot unavailable'),
    )

    await expect(getPortalData()).resolves.toMatchObject({
      stats: {
        totalTweets: 15_334_092,
        accountCount: 42,
        firstYear: 2007,
        currentYear: 2026,
      },
      trends: { years: [], series: [], weekly: [] },
      failures: {
        trends: true,
        liveAnalytics: false,
        memberCount: false,
        corpusRange: false,
      },
    })
  })

  test('preserves the shared ClickHouse counts when live analytics fails', async () => {
    fetchPortalLiveAnalyticsMock.mockRejectedValueOnce(
      new Error('live analytics unavailable'),
    )

    await expect(getPortalData()).resolves.toMatchObject({
      stats: {
        totalTweets: 15_334_092,
        accountCount: 42,
        firstYear: 2007,
        currentYear: 2026,
      },
      failures: {
        liveAnalytics: true,
        memberCount: false,
        corpusRange: false,
      },
    })
  })
})

describe('portal reads', () => {
  const previousUrl = process.env.PORTAL_READ_SUPABASE_URL
  const previousKey = process.env.PORTAL_READ_SUPABASE_ANON_KEY
  const previousClickHouseUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL
  const previousClickHouseToken = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

  beforeEach(() => {
    fetchPortalBangersPageMock.mockReset()
    process.env.PORTAL_READ_SUPABASE_URL = 'https://prod-project.supabase.co/'
    process.env.PORTAL_READ_SUPABASE_ANON_KEY = 'prod-public-anon'
    process.env.CLICKHOUSE_ANALYTICS_API_URL =
      'https://analytics.community-archive.org/analytics'
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = 'test-token'
  })

  test('preserves hydrated own media while still checking quote relations', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/quote_tweets')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        throw new Error(`Unexpected test request: ${url}`)
      })
    const tweet: PortalTweet = {
      id: '42',
      accountId: '7',
      username: 'alice',
      name: 'Alice',
      avatar: null,
      text: 'Hydrated evidence',
      observedAt: '2026-08-07T20:00:00.000Z',
      createdAt: '2026-08-07T19:00:00.000Z',
      likes: 3,
      rts: 2,
      media: [
        {
          url: 'https://pbs.twimg.com/media/evidence.jpg',
          type: 'photo',
          width: 1200,
          height: 800,
        },
      ],
    }

    await expect(enrichPortalTweets([tweet])).resolves.toEqual([tweet])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/quote_tweets?')
  })

  test('falls back to own-media enrichment for partially hydrated rows', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = new URL(String(input))
        const rows = url.pathname.endsWith('/tweet_media')
          ? [
              {
                tweet_id: '42',
                media_url: 'https://pbs.twimg.com/media/fallback.jpg',
                media_type: 'photo',
                width: 1200,
                height: 800,
              },
            ]
          : []
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })
    const tweet: PortalTweet = {
      id: '42',
      accountId: '7',
      username: 'alice',
      name: 'Alice',
      avatar: null,
      text: 'Partial gateway evidence',
      observedAt: '2026-08-07T20:00:00.000Z',
      createdAt: '2026-08-07T19:00:00.000Z',
      likes: 3,
      rts: 2,
    }

    await expect(enrichPortalTweets([tweet])).resolves.toEqual([
      {
        ...tweet,
        media: [
          {
            url: 'https://pbs.twimg.com/media/fallback.jpg',
            type: 'photo',
            width: 1200,
            height: 800,
          },
        ],
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('reads the homepage counts from the shared ClickHouse summary', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            totalTweets: '15334092',
            memberAccounts: '658',
            sourceUpdatedAt: '2026-08-13 18:34:09.903',
            collectedAt: '2026-08-13 18:34:20.907',
            membershipSnapshotAt: '2026-08-13 18:34:00.000',
            source:
              'clickhouse.community_membership_current+corpus_count_current',
            countMode: 'live_membership+cached_unique_tweets_exact',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(fetchPortalGlobalStats()).resolves.toEqual({
      totalTweets: 15_334_092,
      memberCount: 658,
      generatedAt: '2026-08-13T18:34:20.907Z',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://analytics.community-archive.org/analytics/summary'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  test('does not fall back to Supabase when the shared summary fails', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('gateway unavailable', { status: 503 }),
      )

    await expect(fetchPortalGlobalStats()).rejects.toThrow(
      'ClickHouse analytics request failed (503)',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (previousUrl === undefined) {
      delete process.env.PORTAL_READ_SUPABASE_URL
    } else {
      process.env.PORTAL_READ_SUPABASE_URL = previousUrl
    }
    if (previousKey === undefined) {
      delete process.env.PORTAL_READ_SUPABASE_ANON_KEY
    } else {
      process.env.PORTAL_READ_SUPABASE_ANON_KEY = previousKey
    }
    if (previousClickHouseUrl === undefined) {
      delete process.env.CLICKHOUSE_ANALYTICS_API_URL
    } else {
      process.env.CLICKHOUSE_ANALYTICS_API_URL = previousClickHouseUrl
    }
    if (previousClickHouseToken === undefined) {
      delete process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
    } else {
      process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = previousClickHouseToken
    }
  })

  test('loads hydrated stream rows from the ClickHouse gateway', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            tweets: [
              {
                tweetId: '42',
                accountId: '7',
                createdAt: '2026-08-07 19:00:00.000',
                latestObservedAt: '2026-08-07 20:00:00.000',
                fullText: 'A production tweet',
                retweetCount: '2',
                favoriteCount: '3',
                followerCount: '250000',
                username: 'archive_member',
                accountDisplayName: 'Archive Member',
                avatarMediaUrl: 'https://example.com/avatar.jpg',
                media: [
                  {
                    mediaUrl: 'https://pbs.twimg.com/media/main.jpg',
                    mediaType: 'photo',
                    width: 1200,
                    height: 800,
                  },
                ],
              },
            ],
            updateCursor: {
              observedAt: '2026-08-07 20:00:00.000',
              tweetId: '42',
            },
          },
        }),
    } as Response)

    await expect(getPortalStreamPage(30)).resolves.toEqual([
      {
        id: '42',
        accountId: '7',
        username: 'archive_member',
        name: 'Archive Member',
        avatar: 'https://example.com/avatar.jpg',
        text: 'A production tweet',
        observedAt: '2026-08-07T20:00:00.000Z',
        createdAt: '2026-08-07T19:00:00.000Z',
        likes: 3,
        rts: 2,
        followers: 250000,
        media: [
          {
            url: 'https://pbs.twimg.com/media/main.jpg',
            type: 'photo',
            width: 1200,
            height: 800,
          },
        ],
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [tweetsUrl, tweetsInit] = fetchMock.mock.calls[0]
    expect(String(tweetsUrl)).toBe(
      'https://analytics.community-archive.org/analytics/portal-stream?limit=30',
    )
    const query = new URL(String(tweetsUrl)).searchParams
    expect(query.get('limit')).toBe('30')
    expect(tweetsInit).toMatchObject({
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })
    expect(tweetsInit?.signal).toBeInstanceOf(AbortSignal)
  })

  test('loads the initial bangers explorer in a 30-row page', async () => {
    fetchPortalBangersPageMock.mockResolvedValueOnce({
      tweets: [],
      pagination: {
        limit: 30,
        offset: 0,
        nextOffset: null,
        totalAvailable: 0,
        snapshotSize: 0,
        yearCounts: [],
        candidateRankingTruncated: false,
      },
    })

    await expect(getInitialPortalBangersPage()).resolves.toMatchObject({
      tweets: [],
      pagination: { limit: 30, offset: 0 },
    })

    expect(fetchPortalBangersPageMock).toHaveBeenCalledTimes(1)
    expect(fetchPortalBangersPageMock).toHaveBeenCalledWith({
      limit: 30,
      scope: 'all',
      sort: 'quotes',
    })
  })

  test('builds an exact ranked page from the rolling 24-hour prefix', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-10T14:00:00.000Z'))
    fetchPortalBangersPageMock.mockResolvedValueOnce({
      tweets: [
        {
          id: 'boundary',
          username: 'carol',
          name: 'Carol',
          avatar: null,
          text: 'Exactly 24 hours ago',
          observedAt: '2026-08-09T14:00:00.000Z',
          createdAt: '2026-08-09T14:00:00.000Z',
          likes: 20,
          rts: 0,
          quoteCount: 20,
        },
        {
          id: 'today-high',
          username: 'bob',
          name: 'Bob',
          avatar: null,
          text: 'Today with more quotes',
          observedAt: '2026-08-10T12:00:00.000Z',
          createdAt: '2026-08-10T12:00:00.000Z',
          likes: 8,
          rts: 0,
          quoteCount: 9,
        },
        {
          id: 'today-low',
          username: 'alice',
          name: 'Alice',
          avatar: null,
          text: 'Today with fewer quotes',
          observedAt: '2026-08-10T13:00:00.000Z',
          createdAt: '2026-08-10T13:00:00.000Z',
          likes: 4,
          rts: 0,
          quoteCount: 2,
        },
      ],
      pagination: {
        limit: 30,
        offset: 0,
        nextOffset: null,
        totalAvailable: 3,
        snapshotSize: 3,
        yearCounts: [{ year: 2026, count: 3 }],
        candidateRankingTruncated: false,
      },
    })

    try {
      await expect(
        getPortalBangersPage({ period: 'today', sort: 'quotes' }),
      ).resolves.toMatchObject({
        tweets: [{ id: 'boundary' }, { id: 'today-high' }, { id: 'today-low' }],
        pagination: {
          nextOffset: null,
          totalAvailable: 3,
          snapshotSize: 3,
          yearCounts: [{ year: 2026, count: 3 }],
        },
      })
      expect(fetchPortalBangersPageMock).toHaveBeenCalledWith({
        limit: 30,
        offset: 0,
        sort: 'quotes',
        scope: 'all',
        query: '',
        createdAfter: '2026-08-09T14:00:00.000Z',
        createdBefore: '2026-08-10T14:00:00.000Z',
      })
    } finally {
      jest.useRealTimers()
    }
  })

  test('uses an exact rolling seven-day window', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-12T14:00:00.000Z'))
    fetchPortalBangersPageMock.mockResolvedValueOnce({
      tweets: [
        {
          id: 'boundary',
          username: 'alice',
          name: 'Alice',
          avatar: null,
          text: 'Exactly seven days ago',
          observedAt: '2026-08-05T14:00:00.000Z',
          createdAt: '2026-08-05T14:00:00.000Z',
          likes: 4,
          rts: 0,
          quoteCount: 2,
        },
      ],
      pagination: {
        limit: 30,
        offset: 0,
        nextOffset: null,
        totalAvailable: 1,
        snapshotSize: 1,
        yearCounts: [{ year: 2026, count: 1 }],
        candidateRankingTruncated: false,
      },
    })

    try {
      await expect(
        getPortalBangersPage({ period: 'week' }),
      ).resolves.toMatchObject({
        tweets: [{ id: 'boundary' }],
        pagination: { totalAvailable: 1 },
      })
      expect(fetchPortalBangersPageMock).toHaveBeenCalledWith({
        limit: 30,
        offset: 0,
        sort: 'quotes',
        scope: 'all',
        query: '',
        createdAfter: '2026-08-05T14:00:00.000Z',
        createdBefore: '2026-08-12T14:00:00.000Z',
      })
    } finally {
      jest.useRealTimers()
    }
  })

  test('uses a rolling three-calendar-month window', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-10T14:00:00.000Z'))
    fetchPortalBangersPageMock.mockResolvedValueOnce({
      tweets: [
        {
          id: 'inside-quarter',
          username: 'alice',
          name: 'Alice',
          avatar: null,
          text: 'Inside the quarter',
          observedAt: '2026-05-10T14:00:00.000Z',
          createdAt: '2026-05-10T14:00:00.000Z',
          likes: 4,
          rts: 0,
          quoteCount: 2,
        },
      ],
      pagination: {
        limit: 30,
        offset: 0,
        nextOffset: null,
        totalAvailable: 1,
        snapshotSize: 1,
        yearCounts: [{ year: 2026, count: 1 }],
        candidateRankingTruncated: false,
      },
    })

    try {
      await expect(
        getPortalBangersPage({ period: 'three-months' }),
      ).resolves.toMatchObject({
        tweets: [{ id: 'inside-quarter' }],
        pagination: { totalAvailable: 1 },
      })
      expect(fetchPortalBangersPageMock).toHaveBeenCalledWith({
        limit: 30,
        offset: 0,
        sort: 'quotes',
        scope: 'all',
        query: '',
        createdAfter: '2026-05-10T14:00:00.000Z',
        createdBefore: '2026-08-10T14:00:00.000Z',
      })
    } finally {
      jest.useRealTimers()
    }
  })

  test('encodes the observation cursor for ClickHouse polling', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ data: { tweets: [], updateCursor: null } }),
    } as Response)

    await getPortalStreamUpdates(100, {
      observedAt: '2026-08-07T20:00:00.000Z',
      id: '42',
    })

    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(query.get('limit')).toBe('100')
    expect(query.get('after')).toBe('2026-08-07T20:00:00.000Z')
    expect(query.get('after_id')).toBe('42')
  })

  test('encodes an authored-time cursor for older chronological pages', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ data: { tweets: [], updateCursor: null } }),
    } as Response)

    await getPortalStreamPage(31, {
      createdAt: '2026-08-07T19:00:00.000Z',
      id: '42',
    })

    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(query.get('limit')).toBe('31')
    expect(query.get('before')).toBe('2026-08-07T19:00:00.000Z')
    expect(query.get('before_id')).toBe('42')
  })
})

describe('daily banger selection', () => {
  const tweet = (
    id: string,
    createdAt: string,
    likes: number,
  ): PortalTweet => ({
    id,
    createdAt,
    observedAt: createdAt,
    likes,
    rts: 0,
    username: 'member',
    name: 'Member',
    avatar: null,
    text: `Banger ${id}`,
  })

  test('chooses deterministically from the ten closest prior-year dates', () => {
    const candidates = Array.from({ length: 12 }, (_, offset) =>
      tweet(
        String(offset),
        `2024-08-${String(7 + offset).padStart(2, '0')}T12:00:00.000Z`,
        1_000 - offset,
      ),
    )
    candidates.push(tweet('current', '2026-08-07T12:00:00.000Z', 1_000_000))
    const now = new Date('2026-08-07T12:00:00.000Z')

    const selected = selectDailyBangers(candidates, now)
    const selectedAgain = selectDailyBangers(candidates, now)

    expect(selected).toHaveLength(10)
    expect(selectedAgain[0].id).toBe(selected[0].id)
    expect(new Set(selected.map(({ id }) => id))).toEqual(
      new Set(Array.from({ length: 10 }, (_, index) => String(index))),
    )
    expect(selected.some(({ id }) => id === 'current')).toBe(false)
  })

  test('chooses deterministically from the past 24 hours', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    const candidates = [
      tweet('today-1', '2026-08-14T10:00:00.000Z', 100),
      tweet('today-2', '2026-08-14T11:00:00.000Z', 90),
      tweet('overnight', '2026-08-13T12:30:00.000Z', 80),
      tweet('too-old', '2026-08-13T11:59:00.000Z', 1_000_000),
      tweet('future', '2026-08-14T12:01:00.000Z', 1_000_000),
    ]

    const selected = selectDailyRecentBangers(candidates, now)
    const selectedAgain = selectDailyRecentBangers(candidates, now)

    expect(selected).toHaveLength(3)
    expect(selectedAgain[0].id).toBe(selected[0].id)
    expect(selected.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['today-1', 'today-2', 'overnight']),
    )
    expect(selected.some(({ id }) => id === 'too-old')).toBe(false)
    expect(selected.some(({ id }) => id === 'future')).toBe(false)
  })
})
