import { fetchFavoritePeople, loadFavoritePeople } from './favoritePeople'

describe('fetchFavoritePeople', () => {
  test('maps the current-year interaction breakdown', async () => {
    const currentYear = new Date().getUTCFullYear()
    const fetcher = jest.fn().mockResolvedValue({
      data: {
        people: [
          {
            accountId: '20',
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: 'https://pbs.twimg.com/profile_images/bob_normal.jpg',
            interactionCount: '29',
            mentionCount: '12',
            replyCount: '9',
            quoteCount: '3',
            repostCount: '5',
          },
        ],
      },
      query: { year: currentYear, peopleLimit: 8 },
    })

    await expect(fetchFavoritePeople('@alice', 8, fetcher)).resolves.toEqual([
      {
        accountId: '20',
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: 'https://pbs.twimg.com/profile_images/bob_normal.jpg',
        interactionCount: 29,
        mentionCount: 12,
        replyCount: 9,
        quoteCount: 3,
        repostCount: 5,
      },
    ])
    expect(fetcher).toHaveBeenCalledWith(
      ['user', 'alice', 'interactions'],
      new URLSearchParams({ year: String(currentYear), limit: '8' }),
      { revalidate: 300, timeoutMs: 8_000 },
    )
  })

  test('rejects invalid identifiers before calling the gateway', async () => {
    const fetcher = jest.fn()

    await expect(
      fetchFavoritePeople('not/a/user', 8, fetcher),
    ).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('rejects malformed account rows', async () => {
    const currentYear = new Date().getUTCFullYear()
    const fetcher = jest.fn().mockResolvedValue({
      data: { people: [{ accountId: 'not-a-number' }] },
      query: { year: currentYear, peopleLimit: 8 },
    })

    await expect(fetchFavoritePeople('alice', 8, fetcher)).rejects.toThrow(
      'invalid account',
    )
  })

  test('rejects a response for a different year', async () => {
    const currentYear = new Date().getUTCFullYear()
    const fetcher = jest.fn().mockResolvedValue({
      data: { people: [] },
      query: { year: currentYear - 1, peopleLimit: 8 },
    })

    await expect(fetchFavoritePeople('alice', 8, fetcher)).rejects.toThrow(
      'mismatched scope',
    )
  })
})

test('loadFavoritePeople degrades locally when the gateway is unavailable', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  const previousToken = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  delete process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

  await expect(loadFavoritePeople('alice')).resolves.toEqual({
    people: [],
    unavailable: true,
  })

  if (previousToken === undefined) {
    delete process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  } else {
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = previousToken
  }
  consoleError.mockRestore()
})
