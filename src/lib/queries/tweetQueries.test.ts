import { buildAndTsQuery, fetchTweets, FilterCriteria } from './tweetQueries'

// Mock the RPC search function
const mockRpcSearch = jest.fn()
jest.mock('../pgSearch', () => ({
  searchTweets: (...args: any[]) => mockRpcSearch(...args),
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

// Helper to create a fake direct-query result row (nested shape from PostgREST)
function makeDirectTweet(id: string, text: string = `Tweet ${id}`) {
  return {
    tweet_id: id,
    created_at: '2025-01-01T00:00:00Z',
    full_text: text,
    favorite_count: 0,
    retweet_count: 0,
    reply_to_tweet_id: null,
    reply_to_username: null,
    account: {
      username: 'testuser',
      account_display_name: 'Test User',
      profile: { avatar_media_url: null },
    },
    media: [],
  }
}

/**
 * Build a mock Supabase client whose query-builder chain resolves to `rows`.
 * Tracks which `.ilike()` calls were made so tests can assert on them.
 */
function buildMockSupabase(rows: any[]) {
  const ilikeCalls: Array<{ column: string; pattern: string }> = []
  const gteCalls: Array<{ column: string; value: string }> = []
  const lteCalls: Array<{ column: string; value: string }> = []

  const builder: any = {
    select: jest.fn().mockReturnThis(),
    ilike: jest.fn(function (col: string, pattern: string) {
      ilikeCalls.push({ column: col, pattern })
      return builder
    }),
    gte: jest.fn(function (col: string, val: string) {
      gteCalls.push({ column: col, value: val })
      return builder
    }),
    lte: jest.fn(function (col: string, val: string) {
      lteCalls.push({ column: col, value: val })
      return builder
    }),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }

  const supabase = {
    from: jest.fn().mockReturnValue(builder),
    rpc: jest.fn(), // not used in direct-query path
    _builder: builder,
    _ilikeCalls: ilikeCalls,
    _gteCalls: gteCalls,
    _lteCalls: lteCalls,
  }

  return supabase as any
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

describe('fetchTweets — two-query exact-match-first logic', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
  })

  it('runs ILIKE phrase query first, then FTS AND query to fill remaining slots', async () => {
    // ILIKE returns 2 exact matches
    const phraseRows = [makeDirectTweet('1'), makeDirectTweet('2')]
    const supabase = buildMockSupabase(phraseRows)

    // FTS AND returns some overlapping + new results
    const andResults = [makeRpcTweet('1'), makeRpcTweet('2'), makeRpcTweet('3'), makeRpcTweet('4')]
    mockRpcSearch.mockResolvedValueOnce(andResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    // ILIKE query was made on tweets table
    expect(supabase.from).toHaveBeenCalledWith('tweets')
    expect(supabase._ilikeCalls[0]).toEqual({ column: 'full_text', pattern: '%cool project%' })

    // AND RPC was called to fill remaining
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('cool & project')

    // Results: 2 exact + 2 unique AND (IDs 3, 4) = 4 total
    expect(result.tweets).toHaveLength(4)
    expect(result.tweets[0].tweet_id).toBe('1')
    expect(result.tweets[1].tweet_id).toBe('2')
    expect(result.tweets[2].tweet_id).toBe('3')
    expect(result.tweets[3].tweet_id).toBe('4')
    expect(result.error).toBeNull()
  })

  it('skips AND query when ILIKE phrase query fills the page', async () => {
    const phraseRows = Array.from({ length: 5 }, (_, i) => makeDirectTweet(`${i + 1}`))
    const supabase = buildMockSupabase(phraseRows)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    // No RPC call needed — ILIKE filled the page
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.tweets).toHaveLength(5)
    expect(result.error).toBeNull()
  })

  it('handles phrase query returning zero results — falls back to AND', async () => {
    const supabase = buildMockSupabase([]) // ILIKE returns nothing

    const andResults = [makeRpcTweet('10'), makeRpcTweet('11')]
    mockRpcSearch.mockResolvedValueOnce(andResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].tweet_id).toBe('10')
    expect(result.tweets[1].tweet_id).toBe('11')
  })

  it('deduplicates AND results that overlap with phrase results', async () => {
    const phraseRows = [makeDirectTweet('A'), makeDirectTweet('B')]
    const supabase = buildMockSupabase(phraseRows)

    const andResults = [makeRpcTweet('A'), makeRpcTweet('B'), makeRpcTweet('C')]
    mockRpcSearch.mockResolvedValueOnce(andResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 10)

    expect(result.tweets).toHaveLength(3)
    expect(result.tweets.map((t) => t.tweet_id)).toEqual(['A', 'B', 'C'])
  })

  it('applies date filters to the ILIKE phrase query', async () => {
    const supabase = buildMockSupabase([makeDirectTweet('1')])
    mockRpcSearch.mockResolvedValueOnce([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }
    await fetchTweets(supabase, criteria, 1, 5)

    expect(supabase._gteCalls).toContainEqual({ column: 'created_at', value: '2024-01-01' })
    expect(supabase._lteCalls).toContainEqual({ column: 'created_at', value: '2024-12-31' })
  })

  it('applies fromUsername filter to the ILIKE phrase query', async () => {
    const supabase = buildMockSupabase([makeDirectTweet('1')])
    mockRpcSearch.mockResolvedValueOnce([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      fromUsername: 'alice',
    }
    await fetchTweets(supabase, criteria, 1, 5)

    expect(supabase._ilikeCalls).toContainEqual({
      column: 'all_account.username',
      pattern: 'alice',
    })
  })

  it('passes filters through to the AND RPC query', async () => {
    const supabase = buildMockSupabase([]) // ILIKE returns nothing
    mockRpcSearch.mockResolvedValueOnce([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      fromUsername: 'alice',
      replyToUsername: 'bob',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }
    await fetchTweets(supabase, criteria, 1, 5)

    expect(mockRpcSearch.mock.calls[0][1]).toMatchObject({
      from_user: 'alice',
      to_user: 'bob',
      since_date: '2024-01-01',
      until_date: '2024-12-31',
    })
  })

  it('uses single RPC query path for single-word searches', async () => {
    const results = [makeRpcTweet('1'), makeRpcTweet('2')]
    mockRpcSearch.mockResolvedValueOnce(results)

    // Need a supabase mock even though it won't be used for ILIKE
    const supabase = buildMockSupabase([])

    const criteria: FilterCriteria = {
      searchQuery: 'hello',
      rawSearchQuery: 'hello',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('hello')
    expect(result.tweets).toHaveLength(2)
  })

  it('uses single RPC query path when rawSearchQuery is not provided', async () => {
    const results = [makeRpcTweet('1')]
    mockRpcSearch.mockResolvedValueOnce(results)

    const supabase = buildMockSupabase([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('cool & project')
    expect(result.tweets).toHaveLength(1)
  })

  it('returns timeout error message on statement timeout', async () => {
    // The ILIKE query throws (supabase.from chain rejects)
    const supabase = buildMockSupabase([])
    supabase._builder.range.mockRejectedValueOnce(new Error('statement timeout'))

    // Even if ILIKE fails, the catch block should handle it
    // Actually, the ILIKE error is caught silently and returns [].
    // The timeout would come from the RPC call.
    mockRpcSearch.mockRejectedValueOnce(new Error('statement timeout'))

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(result.tweets).toHaveLength(0)
    expect(result.error.message).toContain('timed out')
  })
})
