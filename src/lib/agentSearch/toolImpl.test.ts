jest.mock('./classifier', () => ({
  scoreTweets: jest.fn(async (_criterion: string, items: { id: string }[]) => ({
    scores: new Map(items.map((item) => [item.id, 0.9])),
    scorer: 'decisions',
    costUsd: 0,
  })),
}))
jest.mock('./policy', () => ({
  isPolicyBlockedAccount: jest.fn(async () => false),
}))
jest.mock('./gateway', () => ({
  searchTweets: jest.fn(),
  getTweetsByIds: jest.fn(async () => []),
  // Batched lookups go through the mocked single lookup, 100 ids at a time.
  getTweetsByIdsBatched: jest.fn(async (ids: string[], limits: unknown) => {
    const { getTweetsByIds } = jest.requireMock('./gateway')
    const found: unknown[] = []
    for (let i = 0; i < ids.length; i += 100)
      found.push(...(await getTweetsByIds(ids.slice(i, i + 100), limits)))
    return found
  }),
  // Settled lookups too: a failed batch of 100 is reported, not thrown.
  getTweetsByIdsSettled: jest.fn(async (ids: string[], limits: unknown) => {
    const { getTweetsByIds } = jest.requireMock('./gateway')
    const tweets: unknown[] = []
    const failedIds: string[] = []
    let error: unknown
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      try {
        tweets.push(...(await getTweetsByIds(batch, limits)))
      } catch (caught) {
        failedIds.push(...batch)
        error ??= caught
      }
    }
    return error === undefined
      ? { tweets, failedIds }
      : { tweets, failedIds, error }
  }),
  findMembers: jest.fn(),
  getQuotePosts: jest.fn(),
  getTweetDetails: jest.fn(),
  getTweetThread: jest.fn(),
  getUser: jest.fn(),
}))

import { isPolicyBlockedAccount } from './policy'
import { findMembers, getTweetsByIds, getUser, searchTweets } from './gateway'
import { scoreTweets } from './classifier'
import {
  collectAcrossTerms,
  collectAndScoreImpl,
  findPeopleImpl,
  SEARCH_CONCURRENCY,
  scoreWithParents,
  searchPages,
  searchTweetsImpl,
} from './toolImpl'

const tweet = (id: string) => ({
  id,
  username: 'u',
  name: 'U',
  avatar: null,
  text: `post ${id}`,
  createdAt: `2025-01-01T00:00:${id.padStart(2, '0').slice(-2)}.000Z`,
  likes: 0,
  rts: 0,
  replyToTweetId: null,
  replyToUsername: null,
  quoteTweetId: null,
})

// Each term matches its own list of ids; pages follow offset and limit.
function serve(byTerm: Record<string, string[]>) {
  ;(searchTweets as jest.Mock).mockImplementation(
    async ({ query, offset = 0, limit = 25 }) => {
      const ids = byTerm[query] ?? []
      const page = ids.slice(offset, offset + limit)
      const next = offset + page.length
      return {
        tweets: page.map(tweet),
        nextOffset: next < ids.length ? next : null,
      }
    },
  )
}

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`)

beforeEach(() => jest.clearAllMocks())

test('anyOf searches the query as well as each alternative', async () => {
  serve({ book: ['1'], recommend: ['2'], reading: ['3'] })
  const result = await searchTweetsImpl({
    query: 'book',
    anyOf: ['recommend', 'reading'],
  })
  const queried = (searchTweets as jest.Mock).mock.calls.map(
    ([input]) => input.query,
  )
  expect(queried.sort()).toEqual(['book', 'reading', 'recommend'])
  expect(result.tweets.map((t) => t.id).sort()).toEqual(['1', '2', '3'])
})

test('collect gives every term a share of the limit', async () => {
  serve({ book: range('1', 50), novel: range('2', 50) })
  const result = await collectAndScoreImpl({
    terms: ['book', 'novel'],
    criterion: 'Does this tweet name a book?',
    maxTweets: 10,
  })
  const ids = result.kept.map((t) => t.id)
  expect(ids.filter((id) => id.startsWith('1'))).toHaveLength(5)
  expect(ids.filter((id) => id.startsWith('2'))).toHaveLength(5)
  expect(result.collected).toBe(10)
  expect(result.capped).toBe(true)
})

test('a term that runs out passes its share to the others', async () => {
  serve({ rare: ['10'], common: range('2', 50) })
  const result = await collectAndScoreImpl({
    terms: ['rare', 'common'],
    criterion: 'Does this tweet name a book?',
    maxTweets: 6,
  })
  expect(result.collected).toBe(6)
  expect(result.kept.map((t) => t.id)).toContain('10')
  expect(result.capped).toBe(true)
})

test('collectAcrossTerms searches every term with the same filters', async () => {
  serve({ a: range('1', 3), 'b c': range('2', 3) })
  const filters = {
    mode: 'phrase' as const,
    sort: 'likes' as const,
    replyToUser: 'visakanv',
    fromUser: 'bob',
    since: '2024-01-01',
    until: '2024-12-31',
  }
  const { collected, capped } = await collectAcrossTerms(
    ['a', 'b c'],
    10,
    filters,
    {},
  )
  expect(collected.size).toBe(6)
  expect(capped).toBe(false)
  const calls = (searchTweets as jest.Mock).mock.calls.map(([input]) => input)
  expect(calls.map((input) => input.query).sort()).toEqual(['a', 'b c'])
  for (const input of calls) expect(input).toMatchObject(filters)
})

test('collect keeps at most SEARCH_CONCURRENCY searches in flight', async () => {
  const terms = range('t', 8)
  serve(Object.fromEntries(terms.map((term, i) => [term, range(`${i}x`, 3)])))
  const served = (searchTweets as jest.Mock).getMockImplementation()!
  let inFlight = 0
  let peak = 0
  ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
    peak = Math.max(peak, ++inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight--
    return served(input)
  })
  const result = await collectAndScoreImpl({
    terms,
    criterion: 'Does this tweet name a book?',
    maxTweets: 100,
  })
  expect(peak).toBe(SEARCH_CONCURRENCY)
  expect(result.collected).toBe(24)
  expect(result.capped).toBe(false)
})

test('collect is not capped when every term is exhausted', async () => {
  serve({ a: ['1', '2'], b: ['2', '3'] })
  const result = await collectAndScoreImpl({
    terms: ['a', 'b'],
    criterion: 'Does this tweet name a book?',
    maxTweets: 10,
  })
  expect(result.collected).toBe(3)
  expect(result.capped).toBe(false)
})

describe('findPeopleImpl', () => {
  const user = {
    accountId: '42',
    username: 'notamember',
    displayName: 'Not a member',
    bio: 'bio',
    followers: 1,
    tweets: 1,
    topTweets: [],
  }

  beforeEach(() => {
    ;(findMembers as jest.Mock).mockResolvedValue([])
    ;(getUser as jest.Mock).mockResolvedValue(user)
  })

  test('returns an account outside the directory that policy allows', async () => {
    ;(isPolicyBlockedAccount as jest.Mock).mockResolvedValueOnce(false)
    const result = await findPeopleImpl({ query: '@notamember' })
    expect(result.user).toEqual(user)
    expect(isPolicyBlockedAccount).toHaveBeenCalledWith('42', 'notamember')
  })

  test('withholds an opted-out or blocked account, and one whose check fails', async () => {
    ;(isPolicyBlockedAccount as jest.Mock).mockResolvedValueOnce(true)
    expect((await findPeopleImpl({ query: 'notamember' })).user).toBeNull()
    ;(isPolicyBlockedAccount as jest.Mock).mockRejectedValueOnce(
      new Error('policy read failed'),
    )
    expect((await findPeopleImpl({ query: 'notamember' })).user).toBeNull()
  })
})

describe('searchPages', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

  test('one short page is one call', async () => {
    serve({ x: ids(30) })
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets).toHaveLength(30)
    expect(result.nextOffset).toBeNull()
    expect(searchTweets).toHaveBeenCalledTimes(1)
  })

  test('after the first page, the rest go out together and stay in order', async () => {
    serve({ x: ids(450) })
    let inFlight = 0
    let most = 0
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      most = Math.max(most, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return inner(input)
    })
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets.map((t) => t.id)).toEqual(ids(450))
    expect(result.nextOffset).toBeNull()
    expect(most).toBeGreaterThan(1)
    // 0 alone, then SEARCH_CONCURRENCY (3) at a time: 100-300, then 400-600;
    // nothing asked past the short page's wave.
    expect(
      (searchTweets as jest.Mock).mock.calls.map(([input]) => input.offset),
    ).toEqual([0, 100, 200, 300, 400, 500, 600])
  })

  test('stops at the wanted count and says more exist', async () => {
    serve({ x: ids(2000) })
    const result = await searchPages({ query: 'x' }, 250, {})
    expect(result.tweets).toHaveLength(250)
    expect(result.tweets[249].id).toBe('250')
    expect(result.nextOffset).toBe(250)
    const asked = (searchTweets as jest.Mock).mock.calls.map(([input]) => [
      input.offset,
      input.limit,
    ])
    expect(asked).toEqual([
      [0, 100],
      [100, 100],
      [200, 50],
    ])
  })

  test('continues from an offset', async () => {
    serve({ x: ids(150) })
    const result = await searchPages({ query: 'x' }, 100, {}, 100)
    expect(result.tweets.map((t) => t.id)).toEqual(ids(150).slice(100))
    expect(result.nextOffset).toBeNull()
  })

  // Like the gateway: `rows` matches in offset order, deleted ones left out
  // of a page, and nextOffset is offset + limit while any row is left.
  function serveRows(rows: number, deleted: (row: number) => boolean) {
    ;(searchTweets as jest.Mock).mockImplementation(
      async ({ offset = 0, limit = 25 }) => {
        const tweets = []
        for (let row = offset; row < Math.min(offset + limit, rows); row++)
          if (!deleted(row)) tweets.push(tweet(String(row + 1)))
        return {
          tweets,
          nextOffset: offset + limit < rows ? offset + limit : null,
        }
      },
    )
  }
  const offsetsAsked = () =>
    (searchTweets as jest.Mock).mock.calls.map(([input]) => [
      input.offset,
      input.limit,
    ])
  const kept = (rows: number, deleted: (row: number) => boolean) =>
    ids(rows).filter((_, row) => !deleted(row))

  test('a short page is not the end; it pages on to the count asked for', async () => {
    const gap = (row: number) => row >= 100 && row < 140
    serveRows(300, gap)
    const result = await searchPages({ query: 'x' }, 250, {})
    expect(result.tweets.map((t) => t.id)).toEqual(kept(300, gap).slice(0, 250))
    expect(result.nextOffset).toBe(290)
    expect(offsetsAsked()).toEqual([
      [0, 100],
      [100, 100],
      [200, 50],
      [250, 40],
    ])
  })

  test('an empty first page with more after it is not the end', async () => {
    const firstHundred = (row: number) => row < 100
    serveRows(150, firstHundred)
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets.map((t) => t.id)).toEqual(kept(150, firstHundred))
    expect(result.nextOffset).toBeNull()
  })

  test('stops on a null nextOffset, keeping nothing from later pages of the wave', async () => {
    // The page at 200 ends the search; pages already asked for after it
    // (here still answering) are past the end.
    ;(searchTweets as jest.Mock).mockImplementation(
      async ({ offset = 0, limit = 25 }) => ({
        tweets: ids(limit).map((id) => tweet(`${offset}-${id}`)),
        nextOffset: offset === 200 ? null : offset + limit,
      }),
    )
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets).toHaveLength(300)
    expect(result.tweets[299].id).toBe('200-100')
    expect(result.nextOffset).toBeNull()
    expect(offsetsAsked().map(([offset]) => offset)).toEqual([0, 100, 200, 300])
  })

  test('never asks past the gateway offset limit, nor twice for one offset', async () => {
    serveRows(100_000, () => true)
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets).toEqual([])
    expect(result.nextOffset).toBe(5100)
    expect(Math.max(...offsetsAsked().map(([offset]) => offset))).toBe(5000)
    expect(await searchPages({ query: 'x' }, 1000, {}, 5100)).toEqual({
      tweets: [],
      nextOffset: null,
    })
    ;(searchTweets as jest.Mock).mockReset()
    ;(searchTweets as jest.Mock).mockImplementation(async ({ offset }) => ({
      tweets: [],
      nextOffset: offset,
    }))
    expect(await searchPages({ query: 'x' }, 1000, {})).toEqual({
      tweets: [],
      nextOffset: null,
    })
    expect(searchTweets).toHaveBeenCalledTimes(1)
  })
})

describe('searchPages when a page fails', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
  // Pages from `failAt` on reject; the rest are served.
  const failFrom = (failAt: number, error = new Error('timed out')) => {
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      if ((input.offset ?? 0) >= failAt) throw error
      return inner(input)
    })
  }

  test('a failed later page keeps the pages before it, marked partial', async () => {
    serve({ x: ids(450) })
    failFrom(200)
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result.tweets).toHaveLength(200)
    expect(result.partial).toBe('timed out')
    // Where the next page would start: more may exist.
    expect(result.nextOffset).toBe(200)
  })

  test('a failed first page fails the search', async () => {
    serve({ x: ids(450) })
    failFrom(0)
    await expect(searchPages({ query: 'x' }, 1000, {})).rejects.toThrow(
      'timed out',
    )
  })

  test('a failure past the end of the results does not count', async () => {
    // 150 results: page 2 ends them, so page 3 (sent in the same wave) is
    // past the end and its failure is ignored.
    serve({ x: ids(150) })
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      if ((input.offset ?? 0) >= 200) throw new Error('past the end')
      return inner(input)
    })
    const result = await searchPages({ query: 'x' }, 1000, {})
    expect(result).toEqual({ tweets: expect.any(Array), nextOffset: null })
    expect(result.tweets).toHaveLength(150)
  })

  test('Stop fails the search even after pages were read', async () => {
    serve({ x: ids(450) })
    const stop = new AbortController()
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      if ((input.offset ?? 0) >= 100) {
        stop.abort(new Error('stopped'))
        throw new Error('stopped')
      }
      return inner(input)
    })
    await expect(
      searchPages({ query: 'x' }, 1000, { abortSignal: stop.signal }),
    ).rejects.toThrow('stopped')
  })
})

describe('collectAcrossTerms when a term fails', () => {
  const failing = (bad: string[], error = new Error('timed out')) => {
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      if (bad.includes(input.query)) throw error
      return inner(input)
    })
  }

  test('keeps the terms that answered and names the ones that failed', async () => {
    serve({ a: range('1', 5), b: range('2', 5), c: range('3', 5) })
    failing(['b'])
    const result = await collectAcrossTerms(['a', 'b', 'c'], 100, {}, {})
    expect(result.collected.size).toBe(10)
    expect(result.failedTerms).toEqual([{ term: 'b', error: 'timed out' }])
    // A failed term is not asked for again.
    const asked = (searchTweets as jest.Mock).mock.calls.filter(
      ([input]) => input.query === 'b',
    )
    expect(asked).toHaveLength(1)
  })

  test('fails when no term answers', async () => {
    serve({ a: range('1', 5), b: range('2', 5) })
    failing(['a', 'b'])
    await expect(collectAcrossTerms(['a', 'b'], 100, {}, {})).rejects.toThrow(
      'timed out',
    )
  })

  test('collect_and_score reports the failed terms and scores the rest', async () => {
    serve({ book: range('1', 5), novel: range('2', 5) })
    failing(['novel'])
    const result = await collectAndScoreImpl({
      terms: ['book', 'novel'],
      criterion: 'Does this tweet name a book?',
    })
    expect(result.collected).toBe(5)
    expect(result.failedTerms).toEqual([{ term: 'novel', error: 'timed out' }])
  })

  test('the typed search keeps the alternatives that answered', async () => {
    serve({ book: ['1'], recommend: ['2'] })
    failing(['recommend'])
    const result = await searchTweetsImpl({
      query: 'book',
      anyOf: ['recommend'],
    })
    expect(result.tweets.map((t) => t.id)).toEqual(['1'])
    expect(result).toMatchObject({
      failedTerms: [{ term: 'recommend', error: 'timed out' }],
    })
    failing(['book', 'recommend'])
    await expect(
      searchTweetsImpl({ query: 'book', anyOf: ['recommend'] }),
    ).rejects.toThrow('timed out')

    // Stop after every term answered still fails, with the stop's reason.
    serve({ book: ['1'], recommend: ['2'] })
    const stop = new AbortController()
    stop.abort(new Error('stopped'))
    await expect(
      searchTweetsImpl(
        { query: 'book', anyOf: ['recommend'] },
        { abortSignal: stop.signal },
      ),
    ).rejects.toThrow('stopped')
  })
})

describe('scoreWithParents', () => {
  const full = (id: string) => ({
    ...tweet(id),
    observedAt: '2025-01-01T00:00:00.000Z',
  })
  const reply = (id: string, parent: string) => ({
    ...full(id),
    replyToTweetId: parent,
  })

  test('fetches only the parents it does not already have, and keeps them', async () => {
    const cache = new Map([['p2', full('p2')]])
    ;(getTweetsByIds as jest.Mock).mockImplementation(async (ids: string[]) =>
      ids.map(full),
    )
    await scoreWithParents(
      'Is it a reply?',
      // p1 is among the tweets scored, p2 is in the run's cache, p3 is neither.
      [full('p1'), reply('1', 'p1'), reply('2', 'p2'), reply('3', 'p3')],
      true,
      {},
      {},
      cache,
    )
    expect(
      (getTweetsByIds as jest.Mock).mock.calls.map((call) => call[0]),
    ).toEqual([['p3']])
    expect(cache.has('p3')).toBe(true)
    const items = (scoreTweets as jest.Mock).mock.calls.at(-1)[1]
    expect(
      items.map((item: { parentText: string | null }) => item.parentText),
    ).toEqual([null, 'post p1', 'post p2', 'post p3'])
  })

  test('a failed parent lookup scores the replies on their own words', async () => {
    ;(getTweetsByIds as jest.Mock).mockRejectedValue(new Error('busy'))
    const result = await scoreWithParents(
      'Is it a reply?',
      [full('1'), reply('2', 'p9')],
      true,
      {},
    )
    expect(result.scored.map((t) => t.id).sort()).toEqual(['1', '2'])
    expect(result).toMatchObject({ withoutParent: 1, parentError: 'busy' })
    const items = (scoreTweets as jest.Mock).mock.calls.at(-1)[1]
    expect(items[1].parentText).toBeUndefined()
  })

  test('past the run deadline a failed parent lookup fails the score', async () => {
    ;(getTweetsByIds as jest.Mock).mockRejectedValue(new Error('late'))
    await expect(
      scoreWithParents('Is it a reply?', [reply('2', 'p9')], true, {
        deadlineAt: Date.now() - 1,
      }),
    ).rejects.toThrow('late')
    expect(scoreTweets).not.toHaveBeenCalled()
  })

  test('makes no lookup when every parent is in hand', async () => {
    await scoreWithParents(
      'Is it a reply?',
      [full('p1'), reply('1', 'p1')],
      true,
      {},
    )
    expect(getTweetsByIds).not.toHaveBeenCalled()
  })
})
