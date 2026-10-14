jest.mock('./gateway', () => ({
  getTweetsByIds: jest.fn(async (ids: string[]) =>
    // '2' is opted out: the gateway does not return it.
    ids
      .filter((id) => id !== '2')
      .map((id) => ({ id, username: 'u', text: `gateway text ${id}` })),
  ),
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
      filter: { must: [{ key: 'username', match: { value: 'alice' } }] },
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
