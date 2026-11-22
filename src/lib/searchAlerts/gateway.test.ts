import {
  fetchTweetCards,
  gatewayTimestamp,
  searchNewestMatches,
} from './gateway'

test('asks the search route for the newest matches from the watermark day', async () => {
  const fetcher = jest.fn().mockResolvedValue({
    data: {
      tweets: [
        {
          tweetId: '20',
          createdAt: '2026-11-20 10:00:00',
          replyToTweetId: '7',
        },
        { tweetId: 'bad', createdAt: '2026-11-20 09:00:00' },
        {
          tweetId: '19',
          createdAt: '2026-11-20T08:00:00Z',
          replyToTweetId: null,
        },
      ],
    },
  })
  const matches = await searchNewestMatches(
    { query: 'community archive', mode: 'phrase', fromUser: 'exgenesis' },
    new Date('2026-11-20T06:15:00Z'),
    { fetcher, timeoutMs: 1234 },
  )
  const [path, params, options] = fetcher.mock.calls[0]
  expect(path).toEqual(['search'])
  expect(Object.fromEntries(params)).toEqual({
    q: 'community archive',
    mode: 'phrase',
    since: '2026-11-20',
    sort: 'newest',
    limit: '50',
    exclude_retweets: 'true',
    from_user: 'exgenesis',
  })
  expect(options).toEqual({ timeoutMs: 1234 })
  expect(matches).toEqual([
    { id: '20', replyToId: '7', createdAt: '2026-11-20T10:00:00.000Z' },
    { id: '19', replyToId: null, createdAt: '2026-11-20T08:00:00.000Z' },
  ])
})

test('treats a malformed search response as a failure', async () => {
  const fetcher = jest.fn().mockResolvedValue({ data: {} })
  await expect(
    searchNewestMatches(
      { query: 'x', mode: 'all', fromUser: null },
      new Date(),
      { fetcher },
    ),
  ).rejects.toThrow('invalid response')
})

test('hydrates cards in batches of 100 and skips invalid ids', async () => {
  const fetcher = jest.fn(async (_path: string[], params: URLSearchParams) => ({
    data: {
      tweets: params
        .get('ids')!
        .split(',')
        .map((id) => ({
          tweetId: id,
          createdAt: '2026-11-20 10:00:00',
          fullText: `tweet ${id}`,
          username: 'someone',
        })),
    },
  }))
  const ids = Array.from({ length: 150 }, (_, i) => String(i + 1))
  const cards = await fetchTweetCards([...ids, 'x', '1'], {
    fetcher: fetcher as never,
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(cards.size).toBe(150)
  expect(cards.get('7')?.text).toBe('tweet 7')
  expect(gatewayTimestamp('nope')).toBeNull()
})
