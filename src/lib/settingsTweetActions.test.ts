import { searchOwnTweets } from '@/app/settings/tweet-actions'
import { requireAuth } from '@/lib/auth-utils'
jest.mock('@/lib/auth-utils', () => ({ requireAuth: jest.fn() }))

function mockQuery(rows: unknown[] = []) {
  const calls: Array<[string, unknown[]]> = []
  const builder: any = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method === 'then') {
          return (resolve: (value: unknown) => void) =>
            resolve({ data: rows, error: null })
        }
        return (...args: unknown[]) => {
          calls.push([method, args])
          return builder
        }
      },
    },
  )
  const from = jest.fn(() => builder)
  return { from, calls }
}

test('scopes the bounded read to the verified account, ignoring mutable user metadata', async () => {
  const { from, calls } = mockQuery()
  ;(requireAuth as jest.Mock).mockResolvedValue({
    user: {
      app_metadata: { provider_id: '42' },
      user_metadata: { provider_id: '99' },
    },
    supabase: { from },
  })
  await searchOwnTweets()
  expect(calls).toContainEqual(['eq', ['account_id', '42']])
  expect(calls).toContainEqual(['range', [0, 50]])
  expect(calls.some(([method]) => method === 'textSearch')).toBe(false)
  ;(requireAuth as jest.Mock).mockResolvedValue({
    user: { app_metadata: {}, user_metadata: { provider_id: '99' } },
    supabase: { from },
  })
  await expect(searchOwnTweets()).rejects.toThrow('could not be verified')
  expect(from).toHaveBeenCalledTimes(1)
})

test('applies full-text search and filters, clamping untrusted input', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ tweet_id: String(i) }))
  const { from, calls } = mockQuery(rows)
  ;(requireAuth as jest.Mock).mockResolvedValue({
    user: { app_metadata: { provider_id: '42' } },
    supabase: { from },
  })
  const page = await searchOwnTweets({
    query: '  damn or "hot take"  ',
    kind: 'replies',
    olderThanYears: 5,
    sort: 'least_liked',
    offset: 50,
  })
  expect(page.tweets).toHaveLength(50)
  expect(page.hasMore).toBe(true)
  expect(calls).toContainEqual([
    'textSearch',
    ['fts', 'damn or "hot take"', { type: 'websearch', config: 'english' }],
  ])
  expect(calls).toContainEqual(['not', ['reply_to_tweet_id', 'is', null]])
  expect(calls).toContainEqual([
    'order',
    ['favorite_count', { ascending: true }],
  ])
  expect(calls).toContainEqual(['range', [50, 100]])
  expect(calls.find(([method]) => method === 'lt')?.[1][0]).toBe('created_at')

  calls.length = 0
  await searchOwnTweets({
    kind: 'bogus' as never,
    sort: 'drop table' as never,
    olderThanYears: 7,
    offset: -3,
  })
  expect(calls.map(([method]) => method)).toEqual([
    'select',
    'eq',
    'eq',
    'order',
    'range',
  ])
  expect(calls).toContainEqual(['range', [0, 50]])
})
