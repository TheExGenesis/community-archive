import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { fetchProfileBangers, fetchProfileBangersPage } from './bangers'

const banger = (tweetId: string, quoteCount: string, year: number) => ({
  tweetId,
  quoteCount,
  quotingAccounts: quoteCount,
  accountId: '42',
  username: 'alice',
  displayName: 'Alice',
  avatarMediaUrl: 'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
  createdAt: `${year}-01-02 03:04:05.000`,
  fullText: `Banger ${tweetId}`,
  favoriteCount: '25',
  retweetCount: '4',
  media: [
    {
      mediaUrl: `https://pbs.twimg.com/media/${tweetId}.jpg`,
      mediaType: 'photo',
      width: '1200',
      height: '800',
    },
  ],
  quoteTweetId: tweetId === '100' ? '200' : null,
  quotedTweet:
    tweetId === '100'
      ? {
          tweetId: '200',
          accountId: '77',
          username: 'quoted_member',
          accountDisplayName: 'Quoted Member',
          avatarMediaUrl:
            'https://pbs.twimg.com/profile_images/77/quoted_normal.jpg',
          createdAt: '2024-12-31 23:59:00.000',
          fullText: 'The quoted source',
          favoriteCount: '70',
          retweetCount: '6',
          replyToUsername: null,
          media: [
            {
              mediaUrl: 'https://pbs.twimg.com/media/quoted.jpg',
              mediaType: 'photo',
              width: '900',
              height: '600',
            },
          ],
        }
      : null,
})

test('loads every scoped page of profile bangers above the quote threshold', async () => {
  const fetcher = jest.fn(async (_path: string[], params: URLSearchParams) => {
    const offset = params.get('offset')
    if (offset === '0') {
      return {
        data: [banger('100', '8', 2025), banger('101', '5', 2024)],
        pagination: {
          limit: 100,
          offset: 0,
          nextOffset: 2,
          totalAvailable: 3,
          yearCounts: [
            { year: 2025, count: 1 },
            { year: 2024, count: 2 },
          ],
        },
        query: {
          targetAccountId: '42',
          minQuoteCount: 2,
          sort: 'quotes',
        },
      }
    }
    return {
      data: [banger('102', '2', 2024)],
      pagination: {
        limit: 100,
        offset: 2,
        nextOffset: null,
        totalAvailable: 3,
        yearCounts: [
          { year: 2025, count: 1 },
          { year: 2024, count: 2 },
        ],
      },
      query: {
        targetAccountId: '42',
        minQuoteCount: 2,
        sort: 'quotes',
      },
    }
  }) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileBangers('42', fetcher)).resolves.toEqual({
    tweets: [
      expect.objectContaining({
        tweet_id: '100',
        quote_count: 8,
        avatar_media_url:
          'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
        media: [
          {
            media_url: 'https://pbs.twimg.com/media/100.jpg',
            media_type: 'photo',
            width: 1200,
            height: 800,
          },
        ],
        quote_tweet_id: '200',
        quoted_tweet: expect.objectContaining({
          tweet_id: '200',
          account_id: '77',
          username: 'quoted_member',
          avatar_media_url:
            'https://pbs.twimg.com/profile_images/77/quoted_400x400.jpg',
          full_text: 'The quoted source',
          media: [
            {
              media_url: 'https://pbs.twimg.com/media/quoted.jpg',
              media_type: 'photo',
              width: 900,
              height: 600,
            },
          ],
        }),
      }),
      expect.objectContaining({ tweet_id: '101', quote_count: 5 }),
      expect.objectContaining({ tweet_id: '102', quote_count: 2 }),
    ],
    yearCounts: [
      { year: 2025, count: 1 },
      { year: 2024, count: 2 },
    ],
    total: 3,
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    ['top-quotes'],
    new URLSearchParams({
      limit: '100',
      offset: '0',
      sort: 'quotes',
      target_account_id: '42',
      min_quote_count: '2',
      exclude_self: 'true',
      target_ca_users_only: 'true',
      quote_ca_users_only: 'true',
    }),
    { timeoutMs: 30_000 },
  )
})

test('loads one year-scoped page with deterministic server sorting', async () => {
  const fetcher = jest.fn(async () => ({
    data: [banger('100', '8', 2025)],
    pagination: {
      limit: 2,
      offset: 2,
      nextOffset: 3,
      totalAvailable: 4,
      yearCounts: [
        { year: 2025, count: 4 },
        { year: 2024, count: 2 },
      ],
    },
    query: {
      targetAccountId: '42',
      minQuoteCount: 2,
      sort: 'likes',
      year: 2025,
    },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(
    fetchProfileBangersPage(
      '42',
      { limit: 2, offset: 2, year: 2025, sort: 'likes' },
      fetcher,
    ),
  ).resolves.toMatchObject({
    tweets: [{ tweet_id: '100' }],
    total: 4,
    nextOffset: 3,
  })
  expect(fetcher).toHaveBeenCalledWith(
    ['top-quotes'],
    new URLSearchParams({
      limit: '2',
      offset: '2',
      sort: 'likes',
      target_account_id: '42',
      min_quote_count: '2',
      exclude_self: 'true',
      target_ca_users_only: 'true',
      quote_ca_users_only: 'true',
      year: '2025',
    }),
    { timeoutMs: 30_000 },
  )
})

test('refuses an unscoped legacy gateway response', async () => {
  const fetcher = jest.fn(async () => ({
    data: [banger('100', '8', 2025)],
    pagination: {
      limit: 100,
      offset: 0,
      nextOffset: null,
      totalAvailable: 1,
      yearCounts: [{ year: 2025, count: 1 }],
    },
    query: {},
  })) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileBangers('42', fetcher)).rejects.toThrow(
    'mismatched profile banger scope',
  )
})

test('refuses a gateway response sorted differently from the requested page', async () => {
  const fetcher = jest.fn(async () => ({
    data: [banger('100', '8', 2025)],
    pagination: {
      limit: 2,
      offset: 0,
      nextOffset: null,
      totalAvailable: 1,
      yearCounts: [{ year: 2025, count: 1 }],
    },
    query: {
      targetAccountId: '42',
      minQuoteCount: 2,
      sort: 'quotes',
      year: 2025,
    },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(
    fetchProfileBangersPage(
      '42',
      { limit: 2, year: 2025, sort: 'likes' },
      fetcher,
    ),
  ).rejects.toThrow('mismatched profile banger scope')
})

test('preserves a dangling quoted-tweet ID for the deleted-card placeholder', async () => {
  const row = { ...banger('100', '8', 2025), quotedTweet: null }
  const fetcher = jest.fn(async () => ({
    data: [row],
    pagination: {
      limit: 100,
      offset: 0,
      nextOffset: null,
      totalAvailable: 1,
      yearCounts: [{ year: 2025, count: 1 }],
    },
    query: {
      targetAccountId: '42',
      minQuoteCount: 2,
      sort: 'quotes',
    },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileBangers('42', fetcher)).resolves.toMatchObject({
    tweets: [{ quote_tweet_id: '200', quoted_tweet: null }],
  })
})

test('rejects mismatched quoted-tweet content', async () => {
  const row = banger('100', '8', 2025)
  const fetcher = jest.fn(async () => ({
    data: [
      {
        ...row,
        quotedTweet: { ...row.quotedTweet, tweetId: '201' },
      },
    ],
    pagination: {
      limit: 100,
      offset: 0,
      nextOffset: null,
      totalAvailable: 1,
      yearCounts: [{ year: 2025, count: 1 }],
    },
    query: {
      targetAccountId: '42',
      minQuoteCount: 2,
      sort: 'quotes',
    },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileBangers('42', fetcher)).rejects.toThrow(
    'mismatched quoted tweet content',
  )
})
