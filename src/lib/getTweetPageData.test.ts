import type { TweetData } from '@/lib/tweets/types'
import { createServerAnonClient } from '@/utils/supabase'
import { AnalyticsGatewayError } from './clickhouseGateway'
import { fetchClickHouseTweetThreadPageData } from './clickhouseTweetPage'
import { fetchClickHouseQuotePosts } from './clickhouseQuotePosts'
import { getTweetPageData } from './getTweetPageData'

// Kept only to prove the retired Supabase corpus fallback is never reached.
jest.mock('@/utils/supabase', () => ({ createServerAnonClient: jest.fn() }))
jest.mock('./clickhouseTweetPage', () => ({
  fetchClickHouseTweetThreadPageData: jest.fn(),
}))
jest.mock('./clickhouseQuotePosts', () => ({
  fetchClickHouseQuotePosts: jest.fn(),
}))
jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn().mockResolvedValue(new Map()),
}))

const fetchClickHouseTweetThreadPageDataMock =
  fetchClickHouseTweetThreadPageData as jest.MockedFunction<
    typeof fetchClickHouseTweetThreadPageData
  >
const fetchClickHouseQuotePostsMock =
  fetchClickHouseQuotePosts as jest.MockedFunction<
    typeof fetchClickHouseQuotePosts
  >
const createServerAnonClientMock =
  createServerAnonClient as jest.MockedFunction<typeof createServerAnonClient>

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
  beforeEach(() => {
    jest.clearAllMocks()
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue(null)
    fetchClickHouseQuotePostsMock.mockResolvedValue({
      tweets: [],
      totalCount: 0,
    })
  })

  test('skips the optional quote query for a guest preview', async () => {
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet: mainTweet,
      threadTree: null,
    } as never)
    await getTweetPageData('123', {
      skipQuotePosts: true,
      deferQuotePosts: true,
    })
    expect(fetchClickHouseQuotePostsMock).not.toHaveBeenCalled()
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
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: threadTree as never,
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
    expect(createServerAnonClientMock).not.toHaveBeenCalled()
  })

  test('returns the permalink while quotes are pending', async () => {
    const tweet = {
      ...mainTweet,
      reply_to_username: undefined,
      quote_tweet_id: null,
      retweeted_tweet_id: null,
      media: [],
      urls: [],
    } satisfies TweetData
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: null,
    })
    let resolveQuotes!: (value: {
      tweets: TweetData[]
      totalCount: number
    }) => void
    fetchClickHouseQuotePostsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveQuotes = resolve
      }),
    )

    // This await would hang if optional quotes moved back onto the hot path.
    const page = await getTweetPageData(tweet.tweet_id, {
      deferQuotePosts: true,
    })
    expect(page.tweet).toBe(tweet)
    expect(page.quotePosts).toBeDefined()
    expect(createServerAnonClientMock).not.toHaveBeenCalled()
    const quotes = {
      tweets: [{ ...tweet, tweet_id: 'quote-1' }],
      totalCount: 17,
    }
    resolveQuotes(quotes)
    await expect(page.quotePosts).resolves.toEqual(quotes)
  })

  test('isolates a deferred quote failure from a strict permalink', async () => {
    const tweet = {
      ...mainTweet,
      reply_to_username: undefined,
      quote_tweet_id: null,
      retweeted_tweet_id: null,
      media: [],
      urls: [],
    } satisfies TweetData
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: null,
    })
    let rejectQuotes!: (error: Error) => void
    fetchClickHouseQuotePostsMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectQuotes = reject
      }),
    )
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const page = await getTweetPageData(tweet.tweet_id, {
        deferQuotePosts: true,
      })
      rejectQuotes(new Error('quotes unavailable'))
      await expect(page.quotePosts).resolves.toEqual({
        tweets: [],
        totalCount: 0,
      })
      expect(page.tweet).toBe(tweet)
      expect(createServerAnonClientMock).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
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
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValue({
      tweet,
      threadTree: null,
    })
    fetchClickHouseQuotePostsMock.mockRejectedValue(new Error('gateway down'))
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(getTweetPageData(tweet.tweet_id)).resolves.toEqual({
      tweet,
      threadTree: null,
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
    expect(createServerAnonClientMock).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })

  test('a tweet ClickHouse does not hold is a miss, never a Supabase read', async () => {
    fetchClickHouseTweetThreadPageDataMock.mockResolvedValueOnce(null)
    await expect(getTweetPageData('123')).resolves.toMatchObject({
      tweet: null,
      threadTree: null,
    })
    fetchClickHouseTweetThreadPageDataMock.mockRejectedValueOnce(
      new AnalyticsGatewayError(404, 'Not found'),
    )
    await expect(getTweetPageData('124')).resolves.toMatchObject({
      tweet: null,
    })
    expect(createServerAnonClient).not.toHaveBeenCalled()
  })

  test('a failed thread read throws so the route is not cached as empty', async () => {
    fetchClickHouseTweetThreadPageDataMock.mockRejectedValue(
      new Error('source unavailable'),
    )
    await expect(getTweetPageData('123')).rejects.toThrow('source unavailable')
    fetchClickHouseTweetThreadPageDataMock.mockRejectedValue(
      new AnalyticsGatewayError(502, 'bad gateway'),
    )
    await expect(getTweetPageData('123')).rejects.toThrow('(502)')
    expect(createServerAnonClient).not.toHaveBeenCalled()
  })
})
