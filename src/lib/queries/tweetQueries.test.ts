import {
  buildAndTsQuery,
  fetchTweets,
  FilterCriteria,
  isRetweetText,
} from './tweetQueries'

// Filter-only searches use the signed-in RPC; text searches use ClickHouse.
const mockRpcSearch = jest.fn()
const mockClickHouseSearch = jest.fn()
jest.mock('../pgSearch', () => ({
  searchTweets: (...args: any[]) => mockRpcSearch(...args),
}))
jest.mock('../clickhouseSearch', () => ({
  searchTweetsWithClickHouse: (...args: any[]) => mockClickHouseSearch(...args),
}))

// Helper to create a fake RPC result row (flat shape from RPC)
function makeRpcTweet(id: string, text: string = `Tweet ${id}`) {
  return {
    tweet_id: id,
    account_id: 'acc_1',
    created_at: '2025-01-01T00:00:00Z',
    full_text: text,
    retweet_count: 0,
    favorite_count: 0,
    reply_to_tweet_id: null,
    avatar_media_url: null,
    archive_upload_id: 1,
    username: 'testuser',
    account_display_name: 'Test User',
    media: null,
  }
}

// Minimal mock Supabase (only needed for non-RPC fallback path)
function buildMockSupabase() {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
  }
  return {
    from: jest.fn().mockReturnValue(builder),
    rpc: jest.fn(),
    _builder: builder,
  } as any
}

describe('buildAndTsQuery', () => {
  it('returns the word as-is for a single word', () => {
    expect(buildAndTsQuery('hello')).toBe('hello')
  })

  it('joins multi-word input with &', () => {
    expect(buildAndTsQuery('cool project')).toBe('cool & project')
  })

  it('handles three or more words', () => {
    expect(buildAndTsQuery('the quick fox')).toBe('the & quick & fox')
  })

  it('trims and collapses extra whitespace', () => {
    expect(buildAndTsQuery('  cool   project  ')).toBe('cool & project')
  })

  it('handles empty string', () => {
    expect(buildAndTsQuery('')).toBe('')
  })
})

describe('retweet filtering', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
    mockClickHouseSearch.mockReset()
    delete process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH
  })

  it('recognizes archive-native RT text', () => {
    expect(isRetweetText('RT @alice: hello')).toBe(true)
    expect(isRetweetText('RT @alice hello')).toBe(true)
    expect(isRetweetText('Talking about RT @alice')).toBe(false)
  })

  it('removes retweets from filter-only RPC results', async () => {
    mockRpcSearch.mockResolvedValueOnce([
      makeRpcTweet('rt', 'RT @alice: hello'),
      makeRpcTweet('original', 'hello from me'),
    ])

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        fromUsername: 'alice',
        excludeRetweets: true,
      },
      1,
      20,
    )

    expect(result.tweets.map((tweet) => tweet.tweet_id)).toEqual(['original'])
  })

  it('requests one server-filtered ClickHouse page for retweet exclusion', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH = 'true'
    const clickHouseTweet = (id: string, fullText: string) => ({
      tweet_id: id,
      account_id: 'acc_1',
      created_at: '2025-01-01T00:00:00Z',
      full_text: fullText,
      favorite_count: 0,
      retweet_count: 0,
      reply_to_tweet_id: null,
      account: {
        username: 'testuser',
        account_display_name: 'Test User',
      },
      media: [],
    })
    mockClickHouseSearch.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, index) =>
        clickHouseTweet(`original-${index}`, `Original result ${index}`),
      ),
    )

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        searchQuery: 'result',
        rawSearchQuery: 'result',
        excludeRetweets: true,
      },
      1,
      20,
    )

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    expect(mockClickHouseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ excludeRetweets: true }),
      1,
      20,
    )
    expect(result.tweets).toHaveLength(20)
    expect(
      result.tweets.every((tweet) => !isRetweetText(tweet.full_text)),
    ).toBe(true)
  })
})

describe('fetchTweets — text search reads ClickHouse only', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
    mockClickHouseSearch.mockReset()
    delete process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH
  })

  const clickHouseRow = {
    tweet_id: 'ch-1',
    created_at: '2025-01-01T00:00:00Z',
    full_text: 'open source',
    favorite_count: 1,
    retweet_count: 0,
    reply_to_tweet_id: null,
    account: { username: 'alice', account_display_name: 'Alice' },
    media: [],
  }

  it.each([
    ['single word', 'open'],
    ['multi-word phrase', 'open source'],
  ])(
    'sends a %s search to ClickHouse, even with the preview flag off',
    async (_label, text) => {
      mockClickHouseSearch.mockResolvedValueOnce([clickHouseRow])

      const result = await fetchTweets(
        buildMockSupabase(),
        {
          searchQuery: buildAndTsQuery(text),
          rawSearchQuery: text,
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
      expect(mockRpcSearch).not.toHaveBeenCalled()
      expect(result.tweets[0].tweet_id).toBe('ch-1')
    },
  )

  it('fails without a second corpus scan when ClickHouse is unavailable', async () => {
    mockClickHouseSearch.mockRejectedValueOnce(new Error('gateway down'))
    mockRpcSearch.mockResolvedValueOnce([makeRpcTweet('pg-1')])

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        searchQuery: 'hello',
        rawSearchQuery: 'hello',
      },
      1,
      20,
    )

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.error.message).toBe('gateway down')
    expect(result.tweets).toEqual([])
  })

  it('passes a non-default sort to ClickHouse', async () => {
    mockClickHouseSearch.mockResolvedValueOnce([clickHouseRow])
    await fetchTweets(
      buildMockSupabase(),
      { searchQuery: 'hello', rawSearchQuery: 'hello', sort: 'likes' },
      1,
      20,
    )
    expect(mockClickHouseSearch.mock.calls[0][0].sort).toBe('likes')
  })

  it('does not silently ignore a non-default sort on a filter-only search', async () => {
    const result = await fetchTweets(
      buildMockSupabase(),
      {
        fromUsername: 'alice',
        sort: 'likes',
      },
      1,
      20,
    )

    expect(mockClickHouseSearch).not.toHaveBeenCalled()
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.error.message).toContain('requires a text query')
  })

  it('runs filter-only searches through the signed-in RPC with every filter', async () => {
    mockRpcSearch.mockResolvedValueOnce([makeRpcTweet('1'), makeRpcTweet('2')])

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        fromUsername: 'alice',
        replyToUsername: 'bob',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      2,
      50,
    )

    expect(mockClickHouseSearch).not.toHaveBeenCalled()
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1]).toMatchObject({
      search_query: '',
      from_user: 'alice',
      to_user: 'bob',
      since_date: '2024-01-01',
      until_date: '2024-12-31',
    })
    expect(mockRpcSearch.mock.calls[0][2]).toBe(50)
    expect(mockRpcSearch.mock.calls[0][3]).toBe(50)
    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].account.username).toBe('testuser')
  })

  it('returns a timeout message when the filter-only RPC times out', async () => {
    mockRpcSearch.mockRejectedValueOnce(new Error('statement timeout'))
    const result = await fetchTweets(
      buildMockSupabase(),
      { fromUsername: 'alice' },
      1,
      50,
    )
    expect(result.tweets).toHaveLength(0)
    expect(result.error.message).toContain('timed out')
  })

  it('runs no query without text or filters', async () => {
    const supabase = buildMockSupabase()
    const result = await fetchTweets(supabase, {}, 1, 50)
    expect(result).toEqual({ tweets: [], totalCount: 0, error: null })
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(mockClickHouseSearch).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('progressive canonical results', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH = 'true'
  })
  afterEach(() => delete process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH)

  it('publishes filtered search hits without waiting for quote enrichment', async () => {
    let finishQuotes!: (result: { data: never[]; error: null }) => void
    const quoteRows = new Promise<{ data: never[]; error: null }>((resolve) => {
      finishQuotes = resolve
    })
    const builder = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnValue(quoteRows),
    }
    const client = { from: jest.fn().mockReturnValue(builder) } as any
    const tweet = makeRpcTweet('canonical', 'Useful results')
    mockClickHouseSearch.mockResolvedValueOnce([
      tweet,
      makeRpcTweet('retweet', 'RT @alice: duplicated'),
    ])
    const onBaseTweets = jest.fn()
    const complete = fetchTweets(
      client,
      {
        searchQuery: 'archive',
        rawSearchQuery: 'archive',
        includeQuoteTweets: true,
        excludeRetweets: true,
      },
      1,
      20,
      { onBaseTweets },
    )
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(onBaseTweets).toHaveBeenCalledWith([tweet])
    finishQuotes({ data: [], error: null })
    expect((await complete).tweets).toEqual([tweet])
  })

  it('propagates cancellation without falling back to PostgreSQL', async () => {
    const controller = new AbortController()
    let rejectSearch!: (error: Error) => void
    mockClickHouseSearch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSearch = reject
      }),
    )
    const result = fetchTweets(
      buildMockSupabase(),
      { searchQuery: 'archive', rawSearchQuery: 'archive' },
      1,
      20,
      { signal: controller.signal },
    )
    expect(mockClickHouseSearch.mock.calls[0][4]).toBe(controller.signal)
    controller.abort()
    rejectSearch(new DOMException('Cancelled', 'AbortError'))
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(mockRpcSearch).not.toHaveBeenCalled()
  })
})
