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
  findMembers: jest.fn(),
  getQuotePosts: jest.fn(),
  getTweetDetails: jest.fn(),
  getTweetThread: jest.fn(),
  getUser: jest.fn(),
}))

import { isPolicyBlockedAccount } from './policy'
import { findMembers, getUser, searchTweets } from './gateway'
import {
  collectAndScoreImpl,
  findPeopleImpl,
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
    // 0 alone, then 100-400 together; nothing asked past the short page's wave.
    expect(
      (searchTweets as jest.Mock).mock.calls.map(([input]) => input.offset),
    ).toEqual([0, 100, 200, 300, 400])
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
})
