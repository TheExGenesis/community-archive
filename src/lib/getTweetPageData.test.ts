import type { TweetData } from '@/components/TweetComponent'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { isClickHouseReadsEnabled } from './clickhouseGateway'
import { fetchClickHouseTweetThreadPageData } from './clickhouseTweetPage'
import { fetchClickHouseQuotePosts } from './clickhouseQuotePosts'
import { getTweetPageData } from './getTweetPageData'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('./clickhouseGateway', () => ({
  isClickHouseReadsEnabled: jest.fn(),
}))
jest.mock('./clickhouseTweetPage', () => ({
  fetchClickHouseTweetThreadPageData: jest.fn(),
}))
jest.mock('./clickhouseQuotePosts', () => ({
  fetchClickHouseQuotePosts: jest.fn(),
}))
jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn().mockResolvedValue(new Map()),
}))

const clickHouseEnabledMock = isClickHouseReadsEnabled as jest.MockedFunction<
  typeof isClickHouseReadsEnabled
>
const fetchClickHouseTweetThreadPageDataMock =
  fetchClickHouseTweetThreadPageData as jest.MockedFunction<
    typeof fetchClickHouseTweetThreadPageData
  >
const fetchClickHouseQuotePostsMock =
  fetchClickHouseQuotePosts as jest.MockedFunction<
    typeof fetchClickHouseQuotePosts
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
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue(null)
    fetchClickHouseQuotePostsMock.mockResolvedValue({
      tweets: [],
      totalCount: 0,
    })
    ;(cookies as jest.Mock).mockResolvedValue({})
    createServerClientMock.mockReturnValue({ rpc } as never)
    rpc.mockResolvedValue({ data: emptyRpcResult, error: null })
  })

  test('loads a ClickHouse permalink and its quote posts without Supabase', async () => {
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
    const threadTree = {
      root: tweet.tweet_id,
      roots: [tweet.tweet_id],
      tweets: {
        [tweet.tweet_id]: tweet,
        '2085473085399150818': {
          ...tweet,
          tweet_id: '2085473085399150818',
          reply_to_tweet_id: tweet.tweet_id,
        },
      },
      children: {
        [tweet.tweet_id]: ['2085473085399150818'],
        '2085473085399150818': [],
      },
      parents: { '2085473085399150818': tweet.tweet_id },
      paths: {
        '2085473085399150818': [tweet.tweet_id, '2085473085399150818'],
      },
    }
    clickHouseEnabledMock.mockReturnValue(true)
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: threadTree as never,
      threadTweets: Object.values(threadTree.tweets) as never,
      totalCount: 18,
      nextCursor: {
        createdAt: '2026-08-07T12:05:00.000Z',
        tweetId: '2085473085399150818',
      },
    })
    fetchClickHouseQuotePostsMock.mockResolvedValue({
      totalCount: 7,
      tweets: [
        {
          ...tweet,
          tweet_id: '2085742928454951350',
          quote_tweet_id: tweet.tweet_id,
          full_text: 'My comment',
        },
      ],
    })

    await expect(getTweetPageData(tweet.tweet_id)).resolves.toMatchObject({
      tweet,
      threadTree,
      threadPage: {
        totalCount: 18,
        nextCursor: {
          createdAt: '2026-08-07T12:05:00.000Z',
          tweetId: '2085473085399150818',
        },
      },
      quotingTweetCount: 7,
      quotingTweets: [
        expect.objectContaining({
          tweet_id: '2085742928454951350',
          quote_tweet_id: tweet.tweet_id,
        }),
      ],
    })
    expect(fetchClickHouseTweetThreadPageDataMock).toHaveBeenCalledWith(
      tweet.tweet_id,
    )
    expect(fetchClickHouseQuotePostsMock).toHaveBeenCalledWith(tweet.tweet_id)
    expect(createServerClientMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('keeps the ClickHouse permalink available when quote posts fail', async () => {
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
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: null,
      threadTweets: [tweet as never],
      totalCount: 1,
      nextCursor: null,
    })
    fetchClickHouseQuotePostsMock.mockRejectedValue(new Error('gateway down'))
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(getTweetPageData(tweet.tweet_id)).resolves.toEqual({
      tweet,
      threadTree: null,
      threadPage: null,
      quotingTweets: [],
      quotingTweetCount: 0,
    })
    expect(consoleError).toHaveBeenCalledWith(
      'ClickHouse quote posts failed:',
      {
        tweetId: tweet.tweet_id,
        error: 'gateway down',
      },
    )
    expect(createServerClientMock).not.toHaveBeenCalled()

    consoleError.mockRestore()
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
