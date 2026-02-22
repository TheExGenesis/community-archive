import { buildAndTsQuery, fetchTweets, FilterCriteria } from './tweetQueries'

// Mock both RPC search functions
const mockRpcSearch = jest.fn()
const mockRpcExactPhrase = jest.fn()
jest.mock('../pgSearch', () => ({
  searchTweets: (...args: any[]) => mockRpcSearch(...args),
  searchTweetsExactPhrase: (...args: any[]) => mockRpcExactPhrase(...args),
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

describe('fetchTweets — exact phrase search via FTS simple', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
    mockRpcExactPhrase.mockReset()
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
    expect(mockRpcExactPhrase.mock.calls[0][1].exact_phrase).toBe('cool project')
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
