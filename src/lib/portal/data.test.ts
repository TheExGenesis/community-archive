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

describe('portal REST reads', () => {
  const previousUrl = process.env.PORTAL_READ_SUPABASE_URL
  const previousKey = process.env.PORTAL_READ_SUPABASE_ANON_KEY

  beforeEach(() => {
    process.env.PORTAL_READ_SUPABASE_URL = 'https://prod-project.supabase.co/'
    process.env.PORTAL_READ_SUPABASE_ANON_KEY = 'prod-public-anon'
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
  })

  test('loads stream rows through bounded production REST reads', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            tweet_id: '42',
            account_id: '7',
            created_at: '2026-08-07T19:00:00.000Z',
            updated_at: '2026-08-07T20:00:00.000Z',
            full_text: 'A production tweet',
            retweet_count: 2,
            favorite_count: 3,
            account: {
              username: 'archive_member',
              account_display_name: 'Archive Member',
            },
          },
        ],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            account_id: '7',
            avatar_media_url: 'https://example.com/avatar.jpg',
          },
        ],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
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
        media: [],
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [tweetsUrl, tweetsInit] = fetchMock.mock.calls[0]
    expect(
      String(tweetsUrl).startsWith(
        'https://prod-project.supabase.co/rest/v1/tweets?',
      ),
    ).toBe(true)
    const query = new URL(String(tweetsUrl)).searchParams
    expect(query.get('archive_upload_id')).toBe('is.null')
    expect(query.get('order')).toBe('created_at.desc,tweet_id.desc')
    expect(tweetsInit).toMatchObject({
      cache: 'no-store',
      headers: {
        apikey: 'prod-public-anon',
        Authorization: 'Bearer prod-public-anon',
        'Accept-Profile': 'public',
      },
    })
    expect(tweetsInit?.signal).toBeInstanceOf(AbortSignal)
  })

  test('batch-loads stream images and quoted tweets', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input): Promise<Response> => {
        const url = new URL(String(input))
        const table = url.pathname.split('/').at(-1)
        const tweetFilter = url.searchParams.get('tweet_id')

        if (table === 'tweets') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                tweet_id: '42',
                account_id: '7',
                created_at: '2026-08-07T19:00:00.000Z',
                updated_at: '2026-08-07T20:00:00.000Z',
                full_text: 'A quote with a picture',
                retweet_count: 2,
                favorite_count: 3,
                account: {
                  username: 'archive_member',
                  account_display_name: 'Archive Member',
                },
              },
            ],
          } as Response
        }
        if (table === 'all_profile') {
          return {
            ok: true,
            status: 200,
            json: async () => [],
          } as Response
        }
        if (table === 'quote_tweets') {
          return {
            ok: true,
            status: 200,
            json: async () => [{ tweet_id: '42', quoted_tweet_id: '99' }],
          } as Response
        }
        if (table === 'enriched_tweets') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                tweet_id: '99',
                created_at: '2026-08-06T19:00:00.000Z',
                full_text: 'The quoted thought',
                retweet_count: 4,
                favorite_count: 12,
                username: 'quoted_member',
                account_display_name: 'Quoted Member',
                avatar_media_url: 'https://example.com/quoted-avatar.jpg',
              },
            ],
          } as Response
        }
        if (table === 'tweet_media' && tweetFilter === 'in.(42)') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                tweet_id: '42',
                media_url: 'https://pbs.twimg.com/media/main.jpg',
                media_type: 'photo',
                width: 1200,
                height: 800,
              },
            ],
          } as Response
        }
        if (table === 'tweet_media' && tweetFilter === 'in.(99)') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                tweet_id: '99',
                media_url: 'https://pbs.twimg.com/media/quoted.jpg',
                media_type: 'photo',
                width: null,
                height: null,
              },
            ],
          } as Response
        }
        throw new Error(`Unexpected portal request: ${url}`)
      })

    const [tweet] = await getPortalStreamPage(30)

    expect(tweet.media).toEqual([
      {
        url: 'https://pbs.twimg.com/media/main.jpg',
        type: 'photo',
        width: 1200,
        height: 800,
      },
    ])
    expect(tweet.quotedTweet).toEqual({
      id: '99',
      username: 'quoted_member',
      name: 'Quoted Member',
      avatar: 'https://example.com/quoted-avatar.jpg',
      text: 'The quoted thought',
      createdAt: '2026-08-06T19:00:00.000Z',
      likes: 12,
      rts: 4,
      media: [
        {
          url: 'https://pbs.twimg.com/media/quoted.jpg',
          type: 'photo',
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  test('encodes the composite polling cursor as a PostgREST or filter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response)

    await getPortalStreamUpdates(100, {
      observedAt: '2026-08-07T20:00:00.000Z',
      id: '42',
    })

    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(query.get('order')).toBe('updated_at.asc,tweet_id.asc')
    expect(query.get('or')).toBe(
      '(updated_at.gt.2026-08-07T20:00:00.000Z,and(updated_at.eq.2026-08-07T20:00:00.000Z,tweet_id.gt.42))',
    )
  })

  test('encodes an authored-time cursor for older chronological pages', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response)

    await getPortalStreamPage(31, {
      createdAt: '2026-08-07T19:00:00.000Z',
      id: '42',
    })

    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(query.get('limit')).toBe('31')
    expect(query.get('order')).toBe('created_at.desc,tweet_id.desc')
    expect(query.get('or')).toBe(
      '(created_at.lt.2026-08-07T19:00:00.000Z,and(created_at.eq.2026-08-07T19:00:00.000Z,tweet_id.lt.42))',
    )
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
