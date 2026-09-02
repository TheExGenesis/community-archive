import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { fetchProfileTweets } from './profileTweets'

test('maps a complete engagement-ranked profile tweet package', async () => {
  const fetcher = jest.fn(async () => ({
    data: {
      tweets: [
        {
          tweetId: '101',
          accountId: '42',
          createdAt: '2026-08-14 09:00:00.000',
          fullText: 'A popular tweet',
          replyToUsername: null,
          favoriteCount: '30',
          retweetCount: '4',
          username: 'alice',
          accountDisplayName: 'Alice',
          avatarMediaUrl: 'https://example.com/alice.jpg',
          media: [
            {
              mediaUrl: 'https://example.com/photo.jpg',
              mediaType: 'photo',
              width: 1200,
              height: 800,
            },
          ],
          quoteTweetId: '202',
          quotedTweet: {
            tweetId: '202',
            accountId: '77',
            createdAt: '2026-08-13 09:00:00.000',
            fullText: 'Quoted context',
            replyToUsername: null,
            favoriteCount: '8',
            retweetCount: '1',
            username: 'bob',
            accountDisplayName: 'Bob',
            avatarMediaUrl: null,
            media: [],
          },
        },
      ],
    },
    query: { accountId: '42', limit: 6, sort: 'engagement' },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(
    fetchProfileTweets('42', 'engagement', 6, fetcher),
  ).resolves.toEqual([
    expect.objectContaining({
      tweet_id: '101',
      account_id: '42',
      created_at: '2026-08-14T09:00:00.000Z',
      favorite_count: 30,
      media: [
        {
          media_url: 'https://example.com/photo.jpg',
          media_type: 'photo',
          width: 1200,
          height: 800,
        },
      ],
      quote_tweet_id: '202',
      quoted_tweet: expect.objectContaining({
        tweet_id: '202',
        username: 'bob',
        full_text: 'Quoted context',
      }),
    }),
  ])
  expect(fetcher).toHaveBeenCalledWith(
    ['user', '42', 'tweets'],
    new URLSearchParams({ limit: '6', sort: 'engagement' }),
    { revalidate: 300, timeoutMs: 15_000 },
  )
})

test('rejects a response scoped to a different author', async () => {
  const fetcher = jest.fn(async () => ({
    data: { tweets: [] },
    query: { accountId: '77', limit: 6, sort: 'recent' },
  })) as unknown as AnalyticsGatewayFetcher

  await expect(fetchProfileTweets('42', 'recent', 6, fetcher)).rejects.toThrow(
    'mismatched profile tweets',
  )
})
