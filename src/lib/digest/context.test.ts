import type { Json } from '@/database-types'
import { parseDigestReplies } from './context'

describe('daily digest reply context', () => {
  test('keeps only in-window replies and preserves media and quoted tweets', () => {
    const result = parseDigestReplies(
      {
        conversation_tweets: [
          {
            tweet_id: '1',
            account_id: '91',
            username: 'root',
            account_display_name: 'Root',
            created_at: '2026-08-12T10:00:00.000Z',
            full_text: 'root post',
            favorite_count: 100,
            retweet_count: 5,
            reply_to_tweet_id: null,
          },
          {
            tweet_id: '2',
            account_id: '92',
            username: 'reply',
            account_display_name: 'Reply',
            created_at: '2026-08-12T11:00:00.000Z',
            full_text: 'a useful reply',
            favorite_count: 12,
            retweet_count: 1,
            reply_to_tweet_id: '1',
          },
          {
            tweet_id: '3',
            account_id: '93',
            username: 'old',
            account_display_name: 'Old',
            created_at: '2026-08-10T11:00:00.000Z',
            full_text: 'outside the window',
            favorite_count: 99,
            retweet_count: 0,
            reply_to_tweet_id: '1',
          },
        ],
        conversation_media: [
          {
            tweet_id: '2',
            media_url: 'https://img.example/reply.jpg',
            media_type: 'photo',
            width: 640,
            height: 480,
          },
        ],
        quoted_tweets: [
          {
            source_tweet_id: '2',
            tweet_id: '4',
            account_id: '94',
            username: 'quoted',
            account_display_name: 'Quoted',
            created_at: '2026-08-11T18:00:00.000Z',
            full_text: 'the quoted source',
            favorite_count: 20,
            retweet_count: 2,
            media: [],
          },
        ],
      } as Json,
      {
        bangerTweetId: '1',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        limit: 8,
      },
    )

    expect(result.totalCount).toBe(1)
    expect(result.tweets[0]).toMatchObject({
      id: '2',
      text: 'a useful reply',
      media: [{ url: 'https://img.example/reply.jpg' }],
      quotedTweet: { id: '4', text: 'the quoted source' },
    })
  })

  test('sorts by likes and enforces the reply limit', () => {
    const conversation_tweets = Array.from({ length: 5 }, (_, index) => ({
      tweet_id: String(index + 10),
      account_id: String(index + 100),
      username: `reply_${index}`,
      account_display_name: `Reply ${index}`,
      created_at: `2026-08-12T0${index}:00:00.000Z`,
      full_text: `reply ${index}`,
      favorite_count: index,
      retweet_count: 0,
      reply_to_tweet_id: '1',
    }))

    const result = parseDigestReplies(
      {
        conversation_tweets,
        conversation_media: [],
        quoted_tweets: [],
      } as Json,
      {
        bangerTweetId: '1',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        limit: 2,
      },
    )

    expect(result.totalCount).toBe(5)
    expect(result.tweets.map(({ id }) => id)).toEqual(['14', '13'])
  })
})
