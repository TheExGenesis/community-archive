jest.mock('./classifier', () => ({
  scoreTweets: jest.fn(async (_criterion: string, items: { id: string }[]) => ({
    scores: new Map(items.map((item) => [item.id, 0.9])),
    scorer: 'decisions',
    costUsd: 0,
  })),
}))
jest.mock('./gateway', () => ({
  searchTweets: jest.fn(),
  getTweetsByIds: jest.fn(async () => []),
  findMembers: jest.fn(),
  getQuotePosts: jest.fn(),
  getTweetDetails: jest.fn(),
  getTweetThread: jest.fn(),
  getUser: jest.fn(),
}))

import { searchTweets } from './gateway'
import { collectAndScoreImpl, searchTweetsImpl } from './toolImpl'

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
