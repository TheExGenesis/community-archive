import {
  buildAndTsQuery,
  fetchTweets,
  FilterCriteria,
  isRetweetText,
} from './tweetQueries'

// Mock both RPC search functions
const mockRpcSearch = jest.fn()
const mockRpcExactPhrase = jest.fn()
const mockClickHouseSearch = jest.fn()
jest.mock('../pgSearch', () => ({
  searchTweets: (...args: any[]) => mockRpcSearch(...args),
  searchTweetsExactPhrase: (...args: any[]) => mockRpcExactPhrase(...args),
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
    mockRpcExactPhrase.mockReset()
    mockClickHouseSearch.mockReset()
    delete process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH
  })

  it('recognizes archive-native RT text', () => {
    expect(isRetweetText('RT @alice: hello')).toBe(true)
    expect(isRetweetText('RT @alice hello')).toBe(true)
    expect(isRetweetText('Talking about RT @alice')).toBe(false)
  })

  it('removes retweets from Supabase RPC results as a deployment-safe fallback', async () => {
    mockRpcSearch.mockResolvedValueOnce([
      makeRpcTweet('rt', 'RT @alice: hello'),
      makeRpcTweet('original', 'hello from me'),
    ])

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        searchQuery: 'hello',
        rawSearchQuery: 'hello',
        excludeRetweets: true,
      },
      1,
      20,
    )

    expect(result.tweets.map((tweet) => tweet.tweet_id)).toEqual(['original'])
  })

  it('tops up filtered ClickHouse pages with original tweets', async () => {
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
    mockClickHouseSearch
      .mockResolvedValueOnce([
        ...Array.from({ length: 35 }, (_, index) =>
          clickHouseTweet(`rt-${index}`, `RT @alice: result ${index}`),
        ),
        ...Array.from({ length: 15 }, (_, index) =>
          clickHouseTweet(`original-${index}`, `Original result ${index}`),
        ),
      ])
      .mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, index) =>
          clickHouseTweet(`more-${index}`, `More original ${index}`),
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

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(2)
    expect(result.tweets).toHaveLength(20)
    expect(
      result.tweets.every((tweet) => !isRetweetText(tweet.full_text)),
    ).toBe(true)
  })
})

describe('fetchTweets — exact phrase search via FTS simple', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
    mockRpcExactPhrase.mockReset()
    mockClickHouseSearch.mockReset()
    delete process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH
  })

  it('uses ClickHouse when text-search reads are enabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH = 'true'
    mockClickHouseSearch.mockResolvedValueOnce([
      {
        tweet_id: 'ch-1',
        created_at: '2025-01-01T00:00:00Z',
        full_text: 'open source',
        favorite_count: 1,
        retweet_count: 0,
        reply_to_tweet_id: null,
        account: {
          username: 'alice',
          account_display_name: 'Alice',
        },
        media: [],
      },
    ])

    const result = await fetchTweets(
      buildMockSupabase(),
      {
        searchQuery: 'open & source',
        rawSearchQuery: 'open source',
      },
      1,
      20,
    )

    expect(mockClickHouseSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(mockRpcExactPhrase).not.toHaveBeenCalled()
    expect(result.tweets[0].tweet_id).toBe('ch-1')
  })

  it('falls back to the existing RPC when ClickHouse is unavailable', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH = 'true'
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
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(result.tweets[0].tweet_id).toBe('pg-1')
  })

  it('returns exact phrase matches for multi-word queries', async () => {
    mockRpcExactPhrase.mockResolvedValueOnce([
      makeRpcTweet('1', 'cool project A'),
      makeRpcTweet('2', 'cool project B'),
    ])

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    expect(mockRpcExactPhrase).toHaveBeenCalledTimes(1)
    expect(mockRpcExactPhrase.mock.calls[0][1].exact_phrase).toBe(
      'cool project',
    )
    // Only exact phrase RPC is called, no FTS fallback
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].tweet_id).toBe('1')
    expect(result.tweets[1].tweet_id).toBe('2')
    expect(result.error).toBeNull()
  })

  it('returns full page of exact phrase matches', async () => {
    mockRpcExactPhrase.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) =>
        makeRpcTweet(`${i + 1}`, `cool project tweet ${i + 1}`),
      ),
    )

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.tweets).toHaveLength(5)
    expect(result.error).toBeNull()
  })

  it('returns empty when exact phrase has no matches', async () => {
    mockRpcExactPhrase.mockResolvedValueOnce([])

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 10)

    // No FTS fallback — only exact phrase RPC is used
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.tweets).toHaveLength(0)
  })

  it('passes all filters to exact phrase RPC', async () => {
    mockRpcExactPhrase.mockResolvedValueOnce([])

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      fromUsername: 'alice',
      replyToUsername: 'bob',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }
    await fetchTweets(supabase, criteria, 1, 5)

    expect(mockRpcExactPhrase.mock.calls[0][1]).toMatchObject({
      exact_phrase: 'cool project',
      from_user: 'alice',
      to_user: 'bob',
      since_date: '2024-01-01',
      until_date: '2024-12-31',
    })
  })

  it('uses single RPC query path for single-word searches', async () => {
    const results = [makeRpcTweet('1'), makeRpcTweet('2')]
    mockRpcSearch.mockResolvedValueOnce(results)

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'hello',
      rawSearchQuery: 'hello',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(mockRpcExactPhrase).not.toHaveBeenCalled()
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('hello')
    expect(result.tweets).toHaveLength(2)
  })

  it('uses single RPC query path when rawSearchQuery is not provided', async () => {
    const results = [makeRpcTweet('1')]
    mockRpcSearch.mockResolvedValueOnce(results)

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(mockRpcExactPhrase).not.toHaveBeenCalled()
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(result.tweets).toHaveLength(1)
  })

  it('returns timeout error message on statement timeout', async () => {
    mockRpcExactPhrase.mockRejectedValueOnce(new Error('statement timeout'))

    const supabase = buildMockSupabase()
    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(result.tweets).toHaveLength(0)
    expect(result.error.message).toContain('timed out')
  })
})

describe('fetchTweets — direct profile embeds', () => {
  it('preserves an avatar when PostgREST returns profile as an array', async () => {
    const supabase = buildMockSupabase()
    supabase._builder.range.mockResolvedValueOnce({
      data: [
        {
          tweet_id: '1',
          created_at: '2025-01-01T00:00:00Z',
          full_text: 'Hello',
          favorite_count: 1,
          retweet_count: 0,
          reply_to_tweet_id: null,
          account: {
            username: 'mahlnr',
            account_display_name: 'mahlen',
            profile: [
              {
                avatar_media_url: 'https://example.com/avatar.jpg',
                archive_upload_id: 42,
              },
            ],
          },
          media: [],
        },
      ],
      error: null,
      count: 1,
    })

    const result = await fetchTweets(supabase, { userId: 'account-1' }, 1, 20)

    expect(result.error).toBeNull()
    expect(result.tweets[0].account.profile?.avatar_media_url).toBe(
      'https://example.com/avatar.jpg',
    )
  })
})
