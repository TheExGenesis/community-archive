import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { getTweetPageData } from './getTweetPageData'

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/utils/supabase', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn().mockResolvedValue(new Map()),
}))

const mainTweet = {
  tweet_id: 'original-1',
  account_id: 'account-original',
  username: 'original_author',
  account_display_name: 'Original Author',
  created_at: '2026-08-01T10:00:00Z',
  full_text: 'Original tweet',
  retweet_count: 2,
  favorite_count: 8,
  reply_to_tweet_id: null,
  reply_to_user_id: null,
  reply_to_username: null,
  quoted_tweet_id: null,
  conversation_id: null,
  avatar_media_url: null,
  archive_upload_id: 1,
}

describe('getTweetPageData', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(cookies as jest.Mock).mockResolvedValue({})
    ;(createServerClient as jest.Mock).mockReturnValue({ rpc })
  })

  it('maps reverse quote results into sidebar-ready tweet data', async () => {
    rpc.mockResolvedValue({
      data: {
        tweet: mainTweet,
        media: [],
        mentioned_users: [],
        conversation_tweets: [mainTweet],
        conversation_media: [],
        quoted_tweets: [],
        quoting_tweet_count: 17,
        quoting_tweets: [
          {
            tweet_id: 'quote-1',
            account_id: 'account-quote',
            username: 'quote_author',
            account_display_name: 'Quote Author',
            created_at: '2026-08-02T10:00:00Z',
            full_text: 'My comment',
            retweet_count: 3,
            favorite_count: 13,
            reply_to_tweet_id: null,
            reply_to_username: null,
            quoted_tweet_id: 'original-1',
            avatar_media_url: 'https://example.com/avatar.jpg',
            media: [
              {
                tweet_id: 'quote-1',
                media_url: 'https://example.com/photo.jpg',
                media_type: 'photo',
                width: 800,
                height: 600,
              },
            ],
          },
        ],
      },
      error: null,
    })

    const result = await getTweetPageData('original-1')

    expect(rpc).toHaveBeenCalledWith('get_tweet_page_data', {
      p_tweet_id: 'original-1',
    })
    expect(result.quotingTweetCount).toBe(17)
    expect(result.quotingTweets).toEqual([
      expect.objectContaining({
        tweet_id: 'quote-1',
        quote_tweet_id: 'original-1',
        username: 'quote_author',
        media: [
          {
            media_url: 'https://example.com/photo.jpg',
            media_type: 'photo',
            width: 800,
            height: 600,
          },
        ],
      }),
    ])
  })

  it('defaults reverse quote data when an older RPC response omits it', async () => {
    rpc.mockResolvedValue({
      data: {
        tweet: mainTweet,
        media: [],
        mentioned_users: [],
        conversation_tweets: [mainTweet],
        conversation_media: [],
        quoted_tweets: [],
      },
      error: null,
    })

    const result = await getTweetPageData('original-1')

    expect(result.quotingTweets).toEqual([])
    expect(result.quotingTweetCount).toBe(0)
  })
})
