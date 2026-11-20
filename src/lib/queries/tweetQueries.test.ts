import { fetchTweets, isRetweetText } from './tweetQueries'

// Every search, with or without text, reads ClickHouse through the gateway.
const mockClickHouseSearch = jest.fn()
const mockEnrich = jest.fn()
jest.mock('../clickhouseSearch', () => ({
  ...jest.requireActual('../clickhouseSearch'),
  searchTweetsWithClickHouse: (...args: any[]) => mockClickHouseSearch(...args),
}))
jest.mock('../searchTweetEnrichments', () => ({
  enrichSearchTweets: (...args: any[]) => mockEnrich(...args),
}))

function clickHouseTweet(id: string, fullText = `Tweet ${id}`) {
  return {
    tweet_id: id,
    account_id: 'acc_1',
    created_at: '2025-01-01T00:00:00Z',
    full_text: fullText,
    favorite_count: 0,
    retweet_count: 0,
    reply_to_tweet_id: null,
    account: { username: 'testuser', account_display_name: 'Test User' },
    media: [],
  }
}

beforeEach(() => {
  mockClickHouseSearch.mockReset()
  mockEnrich.mockReset()
})

describe('retweet filtering', () => {
  it('recognizes archive-native RT text', () => {
    expect(isRetweetText('RT @alice: hello')).toBe(true)
    expect(isRetweetText('RT @alice hello')).toBe(true)
    expect(isRetweetText('Talking about RT @alice')).toBe(false)
  })

  it('asks the gateway to drop retweets and drops any that slip through', async () => {
    mockClickHouseSearch.mockResolvedValueOnce([
      clickHouseTweet('rt', 'RT @alice: hello'),
      clickHouseTweet('original', 'hello from me'),
    ])

    const result = await fetchTweets(
      { fromUsername: 'alice', excludeRetweets: true },
      1,
      20,
    )

    expect(mockClickHouseSearch.mock.calls[0][0]).toMatchObject({
      excludeRetweets: true,
    })
    expect(result.tweets.map((tweet) => tweet.tweet_id)).toEqual(['original'])
  })
})

describe('fetchTweets reads ClickHouse only', () => {
  it.each([
    ['single word', 'open'],
    ['multi-word phrase', 'open source'],
  ])('sends a %s search with its filters', async (_label, text) => {
    mockClickHouseSearch.mockResolvedValueOnce([clickHouseTweet('ch-1')])

    const result = await fetchTweets(
      {
        rawSearchQuery: ` ${text} `,
        fromUsername: 'alice',
        startDate: '2024-01-01',
      },
      1,
      20,
    )

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    expect(mockClickHouseSearch.mock.calls[0][0]).toMatchObject({
      rawSearchQuery: text,
      fromUsername: 'alice',
      startDate: '2024-01-01',
    })
    expect(result.tweets[0].tweet_id).toBe('ch-1')
  })

  it('sends a filter-only search to ClickHouse with every filter', async () => {
    mockClickHouseSearch.mockResolvedValueOnce([
      clickHouseTweet('1'),
      clickHouseTweet('2'),
    ])

    const result = await fetchTweets(
      {
        fromUsername: 'alice',
        replyToUsername: 'bob',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      2,
      50,
    )

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    const [criteria, page, pageSize] = mockClickHouseSearch.mock.calls[0]
    expect(criteria).toMatchObject({
      rawSearchQuery: undefined,
      fromUsername: 'alice',
      replyToUsername: 'bob',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    })
    expect([page, pageSize]).toEqual([2, 50])
    expect(result.tweets).toHaveLength(2)
  })

  it('reports a gateway failure without retrying elsewhere', async () => {
    mockClickHouseSearch.mockRejectedValueOnce(new Error('gateway down'))

    const result = await fetchTweets({ rawSearchQuery: 'hello' }, 1, 20)

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    expect(result.error.message).toBe('gateway down')
    expect(result.tweets).toEqual([])
  })

  it('passes a non-default sort to ClickHouse', async () => {
    mockClickHouseSearch.mockResolvedValueOnce([clickHouseTweet('1')])
    await fetchTweets({ rawSearchQuery: 'hello', sort: 'likes' }, 1, 20)
    expect(mockClickHouseSearch.mock.calls[0][0].sort).toBe('likes')
  })

  it('does not silently ignore a non-default sort on a filter-only search', async () => {
    const result = await fetchTweets(
      { fromUsername: 'alice', sort: 'likes' },
      1,
      20,
    )

    expect(mockClickHouseSearch).not.toHaveBeenCalled()
    expect(result.error.message).toContain('requires a text query')
  })

  it('returns a timeout message when the search times out', async () => {
    mockClickHouseSearch.mockRejectedValueOnce(new Error('statement timeout'))
    const result = await fetchTweets({ fromUsername: 'alice' }, 1, 50)
    expect(result.tweets).toHaveLength(0)
    expect(result.error.message).toContain('timed out')
  })

  it('runs no query without text or filters', async () => {
    const result = await fetchTweets({ rawSearchQuery: '  ' }, 1, 50)
    expect(result).toEqual({ tweets: [], totalCount: 0, error: null })
    expect(mockClickHouseSearch).not.toHaveBeenCalled()
  })
})

describe('progressive canonical results', () => {
  it('publishes filtered search hits without waiting for quote enrichment', async () => {
    let finishQuotes!: (tweets: unknown[]) => void
    mockEnrich.mockReturnValueOnce(
      new Promise((resolve) => {
        finishQuotes = resolve
      }),
    )
    const tweet = clickHouseTweet('canonical', 'Useful results')
    mockClickHouseSearch.mockResolvedValueOnce([
      tweet,
      clickHouseTweet('retweet', 'RT @alice: duplicated'),
    ])
    const onBaseTweets = jest.fn()
    const complete = fetchTweets(
      {
        rawSearchQuery: 'archive',
        includeQuoteTweets: true,
        excludeRetweets: true,
      },
      1,
      20,
      { onBaseTweets },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onBaseTweets).toHaveBeenCalledWith([tweet])
    expect(mockEnrich).toHaveBeenCalledWith([tweet], undefined)
    finishQuotes([tweet])
    expect((await complete).tweets).toEqual([tweet])
  })

  it('propagates cancellation', async () => {
    const controller = new AbortController()
    let rejectSearch!: (error: Error) => void
    mockClickHouseSearch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSearch = reject
      }),
    )
    const result = fetchTweets({ rawSearchQuery: 'archive' }, 1, 20, {
      signal: controller.signal,
    })
    expect(mockClickHouseSearch.mock.calls[0][4]).toBe(controller.signal)
    controller.abort()
    rejectSearch(new DOMException('Cancelled', 'AbortError'))
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
