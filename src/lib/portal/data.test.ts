jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import {
  fetchPortalProductionTotals,
  getPortalStream,
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
      'portal-v4:preview:analytics.example:prod-project.supabase.co',
    )
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

    await expect(getPortalStream(30)).resolves.toEqual([
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
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [tweetsUrl, tweetsInit] = fetchMock.mock.calls[0]
    expect(
      String(tweetsUrl).startsWith(
        'https://prod-project.supabase.co/rest/v1/tweets?',
      ),
    ).toBe(true)
    const query = new URL(String(tweetsUrl)).searchParams
    expect(query.get('archive_upload_id')).toBe('is.null')
    expect(query.get('order')).toBe('updated_at.desc,tweet_id.desc')
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

  test('encodes the composite polling cursor as a PostgREST or filter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response)

    await getPortalStream(100, {
      observedAt: '2026-08-07T20:00:00.000Z',
      id: '42',
    })

    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(query.get('order')).toBe('updated_at.asc,tweet_id.asc')
    expect(query.get('or')).toBe(
      '(updated_at.gt.2026-08-07T20:00:00.000Z,and(updated_at.eq.2026-08-07T20:00:00.000Z,tweet_id.gt.42))',
    )
  })

  test('uses production membership and liked-tweet summaries', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-range': '0-0/633' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ total_likes: 13_631_027 }],
      } as Response)

    await expect(fetchPortalProductionTotals()).resolves.toEqual({
      accountCount: 633,
      totalLikes: 13_631_027,
    })

    const memberQuery = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(memberQuery.get('select')).toBe('directory_id')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    })
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/rest/v1/global_activity_summary?',
    )
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
