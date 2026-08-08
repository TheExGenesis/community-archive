import type { TweetData } from '@/components/TweetComponent'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { isClickHouseReadsEnabled } from './clickhouseGateway'
import { fetchClickHouseTweetPageData } from './clickhouseTweetPage'
import { getTweetPageData } from './getTweetPageData'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('./clickhouseGateway', () => ({
  isClickHouseReadsEnabled: jest.fn(),
}))
jest.mock('./clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))
jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn().mockResolvedValue(new Map()),
}))

const clickHouseEnabledMock = isClickHouseReadsEnabled as jest.MockedFunction<
  typeof isClickHouseReadsEnabled
>
const fetchClickHouseTweetPageDataMock =
  fetchClickHouseTweetPageData as jest.MockedFunction<
    typeof fetchClickHouseTweetPageData
  >
const createServerClientMock = createServerClient as jest.MockedFunction<
  typeof createServerClient
>

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

const emptyRpcResult = {
  tweet: null,
  media: [],
  mentioned_users: [],
  conversation_tweets: [],
  conversation_media: [],
  quoted_tweets: [],
  quoting_tweet_count: 0,
  quoting_tweets: [],
}

describe('getTweetPageData', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    clickHouseEnabledMock.mockReturnValue(false)
    fetchClickHouseTweetPageDataMock.mockResolvedValue(null)
    ;(cookies as jest.Mock).mockResolvedValue({})
    createServerClientMock.mockReturnValue({ rpc } as never)
    rpc.mockResolvedValue({ data: emptyRpcResult, error: null })
  })

  test('combines a ClickHouse permalink tweet with Supabase quote metadata', async () => {
    const tweet = {
      tweet_id: '2085473085399150817',
      account_id: '10',
      created_at: '2026-08-07T12:00:00.000Z',
      full_text: 'The linked portal tweet',
      retweet_count: 4,
      favorite_count: 25,
      reply_to_tweet_id: null,
      quote_tweet_id: null,
      retweeted_tweet_id: null,
      avatar_media_url: null,
      username: 'alice',
      account_display_name: 'Alice',
      media: [],
      urls: [],
    } satisfies TweetData
    clickHouseEnabledMock.mockReturnValue(true)
    fetchClickHouseTweetPageDataMock.mockResolvedValue(tweet)
    rpc.mockResolvedValue({
      data: {
        ...emptyRpcResult,
        quoting_tweet_count: 1,
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
            quoted_tweet_id: tweet.tweet_id,
            avatar_media_url: null,
            media: [],
          },
        ],
      },
      error: null,
    })

    await expect(getTweetPageData(tweet.tweet_id)).resolves.toMatchObject({
      tweet,
      threadTree: null,
      quotingTweetCount: 1,
      quotingTweets: [
        expect.objectContaining({
          tweet_id: 'quote-1',
          quote_tweet_id: tweet.tweet_id,
        }),
      ],
    })
    expect(fetchClickHouseTweetPageDataMock).toHaveBeenCalledWith(
      tweet.tweet_id,
    )
    expect(rpc).toHaveBeenCalledWith('get_tweet_page_data', {
      p_tweet_id: tweet.tweet_id,
    })
  })

  test('maps reverse quote results into sidebar-ready tweet data', async () => {
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

  test('defaults reverse quote data when an older RPC response omits it', async () => {
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
