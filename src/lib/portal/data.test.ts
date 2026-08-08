jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import {
  fetchPortalMemberCount,
  getPortalStreamPage,
  getPortalStreamUpdates,
  loadOptionalPortalData,
  loadPortalComponentData,
  portalDataSourceKey,
  resolvePortalReadConfig,
  selectDailyBangers,
} from './data'
import type { PortalTweet } from './types'

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
      'portal-v5:preview:analytics.example:prod-project.supabase.co',
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

describe('portal reads', () => {
  const previousUrl = process.env.PORTAL_READ_SUPABASE_URL
  const previousKey = process.env.PORTAL_READ_SUPABASE_ANON_KEY
  const previousClickHouseUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL
  const previousClickHouseToken = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

  beforeEach(() => {
    process.env.PORTAL_READ_SUPABASE_URL = 'https://prod-project.supabase.co/'
    process.env.PORTAL_READ_SUPABASE_ANON_KEY = 'prod-public-anon'
    process.env.CLICKHOUSE_ANALYTICS_API_URL =
      'https://analytics.community-archive.org/analytics'
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = 'test-token'
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

  test('uses the production uploader and opt-in membership count', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-range': '0-0/633' }),
    } as Response)

    await expect(fetchPortalMemberCount()).resolves.toBe(633)

    const memberQuery = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(memberQuery.get('select')).toBe('directory_id')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
})
