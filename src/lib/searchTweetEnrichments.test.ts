import { enrichSearchTweets } from './searchTweetEnrichments'
import type { TimelineTweet } from './types'

function queryResult(data: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data, error: null }),
  }
}

describe('enrichSearchTweets', () => {
  it('attaches quoted tweet content and media in one batched enrichment', async () => {
    const quoteRelations = queryResult([
      { tweet_id: 'source-1', quoted_tweet_id: 'quoted-1' },
    ])
    const quotedTweets = queryResult([
      {
        tweet_id: 'quoted-1',
        account_id: 'account-2',
        created_at: '2026-08-06T12:00:00Z',
        full_text: 'Quoted body',
        retweet_count: 2,
        favorite_count: 5,
        account: {
          username: 'quoted_user',
          account_display_name: 'Quoted User',
          profile: [
            {
              avatar_media_url: 'https://example.com/avatar.jpg',
              archive_upload_id: 9,
            },
          ],
        },
        media: [
          {
            media_url: 'https://example.com/quoted-photo.jpg',
            media_type: 'photo',
            width: 800,
            height: 600,
          },
        ],
      },
    ])
    const supabase = {
      from: jest.fn((table: string) =>
        table === 'quote_tweets' ? quoteRelations : quotedTweets,
      ),
    } as any
    const tweets: TimelineTweet[] = [
      {
        tweet_id: 'source-1',
        account_id: 'account-1',
        created_at: '2026-08-07T12:00:00Z',
        full_text: 'My comment',
        favorite_count: 1,
        retweet_count: 0,
        reply_to_tweet_id: null,
        account: {
          username: 'source_user',
          account_display_name: 'Source User',
        },
        media: [],
      },
    ]

    const result = await enrichSearchTweets(supabase, tweets)

    expect(result[0]).toMatchObject({
      quote_tweet_id: 'quoted-1',
      quoted_tweet: {
        tweet_id: 'quoted-1',
        username: 'quoted_user',
        avatar_media_url: 'https://example.com/avatar.jpg',
        media: [
          {
            media_url: 'https://example.com/quoted-photo.jpg',
            media_type: 'photo',
          },
        ],
      },
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})
