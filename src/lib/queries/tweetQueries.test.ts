import { buildTsQueries, fetchTweets, FilterCriteria } from './tweetQueries'

// Mock the RPC search function
const mockRpcSearch = jest.fn()
jest.mock('../pgSearch', () => ({
  searchTweets: (...args: any[]) => mockRpcSearch(...args),
}))

// Helper to create a fake RPC result row
function makeTweet(id: string, text: string = `Tweet ${id}`) {
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

// Stub Supabase client — only used as a pass-through to the mocked RPC
const fakeSupabase = {} as any

describe('buildTsQueries', () => {
  it('returns identical phrase and AND for a single word', () => {
    const result = buildTsQueries('hello')
    expect(result).toEqual({ phrase: 'hello', and: 'hello', isMultiWord: false })
  })

  it('builds phrase with <-> and AND with & for multi-word input', () => {
    const result = buildTsQueries('cool project')
    expect(result).toEqual({
      phrase: 'cool <-> project',
      and: 'cool & project',
      isMultiWord: true,
    })
  })

  it('handles three or more words', () => {
    const result = buildTsQueries('the quick fox')
    expect(result).toEqual({
      phrase: 'the <-> quick <-> fox',
      and: 'the & quick & fox',
      isMultiWord: true,
    })
  })

  it('trims and collapses extra whitespace', () => {
    const result = buildTsQueries('  cool   project  ')
    expect(result).toEqual({
      phrase: 'cool <-> project',
      and: 'cool & project',
      isMultiWord: true,
    })
  })

  it('handles empty string', () => {
    const result = buildTsQueries('')
    expect(result).toEqual({ phrase: '', and: '', isMultiWord: false })
  })
})

describe('fetchTweets — two-query exact-match-first logic', () => {
  beforeEach(() => {
    mockRpcSearch.mockReset()
  })

  it('runs phrase query first, then AND query to fill remaining slots', async () => {
    const phraseResults = [makeTweet('1'), makeTweet('2')]
    const andResults = [makeTweet('1'), makeTweet('2'), makeTweet('3'), makeTweet('4')]

    mockRpcSearch
      .mockResolvedValueOnce(phraseResults)   // phrase query
      .mockResolvedValueOnce(andResults)       // AND query

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 5)

    // Should have called RPC twice
    expect(mockRpcSearch).toHaveBeenCalledTimes(2)

    // First call: phrase query
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('cool <-> project')

    // Second call: AND query
    expect(mockRpcSearch.mock.calls[1][1].search_query).toBe('cool & project')

    // Results: 2 phrase matches + 2 unique AND matches (IDs 3, 4) = 4 total
    // (ID 1 and 2 are duplicates and excluded from AND results)
    expect(result.tweets).toHaveLength(4)
    expect(result.tweets[0].tweet_id).toBe('1')
    expect(result.tweets[1].tweet_id).toBe('2')
    expect(result.tweets[2].tweet_id).toBe('3')
    expect(result.tweets[3].tweet_id).toBe('4')
    expect(result.error).toBeNull()
  })

  it('skips AND query when phrase query fills the page', async () => {
    const phraseResults = Array.from({ length: 5 }, (_, i) => makeTweet(`${i + 1}`))

    mockRpcSearch.mockResolvedValueOnce(phraseResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 5)

    // Only one RPC call — phrase filled the page
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(result.tweets).toHaveLength(5)
    expect(result.error).toBeNull()
  })

  it('handles phrase query returning zero results', async () => {
    const andResults = [makeTweet('10'), makeTweet('11')]

    mockRpcSearch
      .mockResolvedValueOnce([])          // phrase: no results
      .mockResolvedValueOnce(andResults)   // AND: some results

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 5)

    expect(mockRpcSearch).toHaveBeenCalledTimes(2)
    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].tweet_id).toBe('10')
    expect(result.tweets[1].tweet_id).toBe('11')
  })

  it('deduplicates AND results that overlap with phrase results', async () => {
    const phraseResults = [makeTweet('A'), makeTweet('B')]
    // AND returns the same IDs plus one new one
    const andResults = [makeTweet('A'), makeTweet('B'), makeTweet('C')]

    mockRpcSearch
      .mockResolvedValueOnce(phraseResults)
      .mockResolvedValueOnce(andResults)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 10)

    expect(result.tweets).toHaveLength(3)
    expect(result.tweets.map(t => t.tweet_id)).toEqual(['A', 'B', 'C'])
  })

  it('uses single query path for single-word searches', async () => {
    const results = [makeTweet('1'), makeTweet('2')]
    mockRpcSearch.mockResolvedValueOnce(results)

    const criteria: FilterCriteria = {
      searchQuery: 'hello',
      rawSearchQuery: 'hello',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 50)

    // Single word — only one RPC call
    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('hello')
    expect(result.tweets).toHaveLength(2)
  })

  it('uses single query path when rawSearchQuery is not provided', async () => {
    const results = [makeTweet('1')]
    mockRpcSearch.mockResolvedValueOnce(results)

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      // no rawSearchQuery — falls back to single query
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 50)

    expect(mockRpcSearch).toHaveBeenCalledTimes(1)
    expect(mockRpcSearch.mock.calls[0][1].search_query).toBe('cool & project')
    expect(result.tweets).toHaveLength(1)
  })

  it('passes filters through to both queries', async () => {
    mockRpcSearch
      .mockResolvedValueOnce([makeTweet('1')])
      .mockResolvedValueOnce([])

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
      fromUsername: 'alice',
      replyToUsername: 'bob',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }
    await fetchTweets(fakeSupabase, criteria, 1, 5)

    // Both calls should include the filter params
    for (const call of mockRpcSearch.mock.calls) {
      expect(call[1].from_user).toBe('alice')
      expect(call[1].to_user).toBe('bob')
      expect(call[1].since_date).toBe('2024-01-01')
      expect(call[1].until_date).toBe('2024-12-31')
    }
  })

  it('returns timeout error message on statement timeout', async () => {
    mockRpcSearch.mockRejectedValueOnce(new Error('statement timeout'))

    const criteria: FilterCriteria = {
      searchQuery: 'cool & project',
      rawSearchQuery: 'cool project',
    }
    const result = await fetchTweets(fakeSupabase, criteria, 1, 50)

    expect(result.tweets).toHaveLength(0)
    expect(result.error.message).toContain('timed out')
  })
})
