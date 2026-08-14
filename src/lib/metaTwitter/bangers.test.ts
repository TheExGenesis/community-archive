import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { fetchProfileBangers } from './bangers'

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
})

test('loads every scoped page of profile bangers above the quote threshold', async () => {
  const fetcher = jest.fn(async (_path: string[], params: URLSearchParams) => {
    const offset = params.get('offset')
    if (offset === '0') {
      return {
        data: [banger('100', '8', 2025), banger('101', '5', 2024)],
        pagination: {
          nextOffset: 2,
          totalAvailable: 3,
          yearCounts: [
            { year: 2025, count: 1 },
            { year: 2024, count: 2 },
          ],
        },
        query: { targetAccountId: '42', minQuoteCount: 2 },
      }
    }
    return {
      data: [banger('102', '2', 2024)],
      pagination: {
        nextOffset: null,
        totalAvailable: 3,
        yearCounts: [
          { year: 2025, count: 1 },
          { year: 2024, count: 2 },
        ],
      },
      query: { targetAccountId: '42', minQuoteCount: 2 },
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

test('refuses an unscoped legacy gateway response', async () => {
  const fetcher = jest.fn(async () => ({
    data: [banger('100', '8', 2025)],
    pagination: {
      nextOffset: null,
      totalAvailable: 1,
      yearCounts: [{ year: 2025, count: 1 }],
    },
    query: {},
  })) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileBangers('42', fetcher)).rejects.toThrow(
    'does not support scoped profile bangers yet',
  )
})
