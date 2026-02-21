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

describe('fetchTweets — ILIKE phrase first + FTS AND fill with post-filter', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
  })

  it('shows ILIKE exact matches first, then FTS to fill remaining slots', async () => {
    // ILIKE returns 2 exact matches
    const ilikeRows = [makeDirectTweet('1', 'cool project A'), makeDirectTweet('2', 'cool project B')]
    const supabase = buildMockSupabase(ilikeRows)

    // FTS returns overlapping + new results (must contain both words to pass post-filter)
    const ftsResults = [
      makeRpcTweet('1', 'cool project A'),
      makeRpcTweet('2', 'cool project B'),
      makeRpcTweet('3', 'this project is really cool'),
      makeRpcTweet('4', 'cool project C'),
    ]
    mockRpcSearch.mockResolvedValueOnce(ftsResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    // ILIKE query was made on tweets table
    expect(supabase.from).toHaveBeenCalledWith('tweets')
    expect(supabase._ilikeCalls[0]).toEqual({ column: 'full_text', pattern: '%cool project%' })

    // FTS was called to fill remaining
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)

    // ILIKE results first, then deduplicated FTS results
    expect(result.tweets).toHaveLength(4)
    expect(result.tweets[0].tweet_id).toBe('1') // from ILIKE
    expect(result.tweets[1].tweet_id).toBe('2') // from ILIKE
    expect(result.error).toBeNull()
  })

  it('skips FTS when ILIKE fills the page', async () => {
    const ilikeRows = Array.from({ length: 5 }, (_, i) =>
      makeDirectTweet(`${i + 1}`, `cool project tweet ${i + 1}`),
    )
    const supabase = buildMockSupabase(ilikeRows)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 5)

    // No FTS call needed — ILIKE filled the page
    expect(mockRpcSearch).not.toHaveBeenCalled()
    expect(result.tweets).toHaveLength(5)
    expect(result.error).toBeNull()
  })

  it('falls back to FTS when ILIKE returns nothing', async () => {
    const supabase = buildMockSupabase([]) // ILIKE returns nothing

    const ftsResults = [
      makeRpcTweet('1', 'cool project here'),
      makeRpcTweet('2', 'the project is cool'),
    ]
    mockRpcSearch.mockResolvedValueOnce(ftsResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(supabase, criteria, 1, 10)

    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(result.tweets).toHaveLength(2)
  })

  it('post-filters FTS results for stop-word-heavy phrases (word boundary)', async () => {
    const supabase = buildMockSupabase([]) // ILIKE returns nothing

    const ftsResults = [
      makeRpcTweet('1', 'you can just do things'),            // all words ✓
      makeRpcTweet('2', 'the thing is interesting'),           // only "thing" ✗
      makeRpcTweet('3', 'some things happened'),               // only "things" ✗
      makeRpcTweet('4', 'You Can Just Do Things differently'), // all words ✓
      makeRpcTweet('5', 'cancel doing things unjust'),         // substrings only ✗
    ]
    mockRpcSearch.mockResolvedValueOnce(ftsResults)

    const criteria: FilterCriteria = {
      searchQuery: 'you & can & just & do & things',
      rawSearchQuery: 'you can just do things',
    }
    const result = await fetchTweets(supabase, criteria, 1, 50)

    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].tweet_id).toBe('1')
    expect(result.tweets[1].tweet_id).toBe('4')
  })

  it('passes filters through to the RPC query', async () => {
    const supabase = buildMockSupabase([])
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

  it('applies date and username filters to the ILIKE query', async () => {
    const supabase = buildMockSupabase([makeDirectTweet('1', 'cool project')])
    mockRpcSearch.mockResolvedValueOnce([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      fromUsername: 'alice',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }
    await fetchTweets(supabase, criteria, 1, 5)

    expect(supabase._ilikeCalls).toContainEqual({ column: 'all_account.username', pattern: 'alice' })
    expect(supabase._gteCalls).toContainEqual({ column: 'created_at', value: '2024-01-01' })
    expect(supabase._lteCalls).toContainEqual({ column: 'created_at', value: '2024-12-31' })
  })

  it('uses single RPC query path for single-word searches', async () => {
    const results = [makeRpcTweet('1'), makeRpcTweet('2')]
    mockRpcSearch.mockResolvedValueOnce(results)

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
    const supabase = buildMockSupabase([])
    supabase._builder.range.mockRejectedValueOnce(new Error('statement timeout'))
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
