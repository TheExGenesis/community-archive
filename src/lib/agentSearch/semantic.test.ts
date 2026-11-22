jest.mock('./gateway', () => ({
  findMembers: jest.fn(async () => [
    { accountId: '9', username: 'Alice', displayName: 'Alice' },
  ]),
  getTweetsByIds: jest.fn(async (ids: string[]) =>
    // '2' is opted out: the gateway does not return it.
    ids
      .filter((id) => id !== '2')
      .map((id) => ({ id, username: 'u', text: `gateway text ${id}` })),
  ),
  getTweetsByIdsBatched: jest.fn(async (ids: string[], limits: unknown) =>
    jest.requireMock('./gateway').getTweetsByIds(ids, limits),
  ),
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
}))

import { RunDeadlineError } from './deadline'
import { getTweetsByIds } from './gateway'
import {
  DEFAULT_SEMANTIC_SEARCH_URL,
  semanticSearch,
  semanticSearchUrl,
} from './semantic'

const respond = (body: unknown, ok = true, status = 200) =>
  jest.fn(async () => ({ ok, status, json: async () => body }) as Response)

describe('semantic search', () => {
  test('a failed lookup loses only its own matches, and they are counted', async () => {
    const keys = Array.from({ length: 150 }, (_, i) => ({
      key: String(1000 + i),
      distance: 0.9,
    }))
    const fetchImpl = respond({ success: true, results: keys, count: 150 })
    ;(getTweetsByIds as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('busy')
    })
    const result = await semanticSearch(
      { query: 'an idea' },
      {},
      fetchImpl as unknown as typeof fetch,
    )
    // The first batch of 100 failed; the second answered.
    expect(result.tweets).toHaveLength(50)
    expect(result.unfetched).toBe(100)
    expect(result.matched).toBe(150)
  })

  test('fails when no match could be fetched', async () => {
    const fetchImpl = respond({
      success: true,
      results: [{ key: '7', distance: 0.9 }],
      count: 1,
    })
    ;(getTweetsByIds as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('busy')
    })
    await expect(
      semanticSearch(
        { query: 'an idea' },
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow('busy')
  })

  test('sends the query and filter, then re-fetches the ids through the gateway', async () => {
    const fetchImpl = respond({
      success: true,
      results: [
        {
          key: '3',
          distance: 0.91234,
          metadata: { text: 'API text, never used' },
        },
        { key: '2', distance: 0.9, metadata: { text: 'opted out' } },
        { key: '1', distance: 0.88 },
        { key: 'not-an-id', distance: 0.5 },
      ],
      count: 4,
    })
    const result = await semanticSearch(
      {
        query: ' moving there for work ',
        fromUser: '@alice',
        k: 5000,
        threshold: 2,
      },
      {},
      fetchImpl as unknown as typeof fetch,
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(DEFAULT_SEMANTIC_SEARCH_URL)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(
      /^CommunityArchive-AskTheArchive\//,
    )
    expect(JSON.parse(init.body as string)).toEqual({
      searchTerm: 'moving there for work',
      k: 1000,
      threshold: 1,
      with_payload: false,
      filter: { must: [{ key: 'username', match: { value: 'Alice' } }] },
    })
    expect(getTweetsByIds).toHaveBeenCalledWith(['3', '2', '1'], {})
    // The API's order and distance; the gateway's text; opted-out ids gone.
    expect(result.tweets.map((t) => [t.id, t.distance, t.text])).toEqual([
      ['3', 0.912, 'gateway text 3'],
      ['1', 0.88, 'gateway text 1'],
    ])
    expect(result.matched).toBe(3)
  })

  test('fails loudly on an HTTP error or a bad payload', async () => {
    await expect(
      semanticSearch(
        { query: 'x' },
        {},
        respond({}, false, 503) as unknown as typeof fetch,
      ),
    ).rejects.toThrow('HTTP 503')
    await expect(
      semanticSearch(
        { query: 'x' },
        {},
        respond({ success: false }) as unknown as typeof fetch,
      ),
    ).rejects.toThrow('invalid payload')
  })

  test('never starts after the run deadline', async () => {
    const fetchImpl = respond({ success: true, results: [] })
    await expect(
      semanticSearch(
        { query: 'x' },
        { deadlineAt: Date.now() - 1 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RunDeadlineError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('the endpoint can be overridden', () => {
    const env = {
      SEMANTIC_SEARCH_URL: 'http://localhost:9/x',
    } as unknown as NodeJS.ProcessEnv
    expect(semanticSearchUrl(env)).toBe('http://localhost:9/x')
  })
})
