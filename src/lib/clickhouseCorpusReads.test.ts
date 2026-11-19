import {
  fetchAccountTweetCounts,
  fetchQuoteAuthors,
  fetchTopMentionedUsers,
  fetchTweetCards,
} from './clickhouseCorpusReads'
import type { AnalyticsGatewayFetcher } from './clickhouseGateway'

function gateway(handler: (path: string, ids: string[]) => unknown) {
  return jest.fn(async (path: string[], params: URLSearchParams) =>
    handler(path.join('/'), (params.get('ids') ?? '').split(',')),
  ) as unknown as AnalyticsGatewayFetcher & jest.Mock
}

const ids = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => String(from + index))

describe('fetchTweetCards', () => {
  it('reads unique numeric ids in batches of 100 and keys cards by id', async () => {
    const fetcher = gateway((_path, batch) => ({
      data: { tweets: batch.slice(1).map((tweetId) => ({ tweetId })) },
    }))

    const cards = await fetchTweetCards([...ids(150), '1', 'nope'], { fetcher })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      fetcher.mock.calls.map(([path, params]) => [
        path,
        params.get('ids')?.split(',').length,
      ]),
    ).toEqual([
      [['tweet-cards'], 100],
      [['tweet-cards'], 50],
    ])
    expect(cards.size).toBe(148)
    expect(cards.has('1')).toBe(false)
    expect(cards.get('2')).toEqual({ tweetId: '2' })
  })

  it('throws on a malformed response', async () => {
    const fetcher = gateway(() => ({ data: {} }))
    await expect(fetchTweetCards(['1'], { fetcher })).rejects.toThrow('invalid')
  })
})

describe('fetchQuoteAuthors', () => {
  it('splits a truncated batch until every response is complete', async () => {
    // Pretend more than one target per request overflows the 10,000-row cap.
    const fetcher = gateway((_path, batch) => ({
      data: {
        truncated: batch.length > 1 || batch[0] === '3',
        quotes: batch.map((quotedTweetId) => ({
          tweetId: `q${quotedTweetId}`,
          quotedTweetId,
          accountId: '7',
          username: 'member',
        })),
      },
    }))

    const result = await fetchQuoteAuthors(['1', '2', '3'], { fetcher })

    expect(result.quotes.map((quote) => quote.quotedTweetId).sort()).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(result.truncatedTweetIds).toEqual(['3'])
    // [1,2,3] -> [1,2] + [3] -> [1] + [2]
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
})

describe('fetchAccountTweetCounts', () => {
  it('parses decimal string counts', async () => {
    const fetcher = gateway((_path, batch) => ({
      data: {
        counts: batch.map((accountId) => ({ accountId, tweetCount: '12' })),
      },
    }))
    const counts = await fetchAccountTweetCounts(['5', '6'], { fetcher })
    expect(Array.from(counts)).toEqual([
      ['5', 12],
      ['6', 12],
    ])
  })
})

describe('fetchTopMentionedUsers', () => {
  it('clamps the limit to the gateway bounds', async () => {
    const fetcher = jest.fn(async () => ({ data: { users: [] } }))
    await fetchTopMentionedUsers(500, {
      fetcher: fetcher as unknown as AnalyticsGatewayFetcher,
    })
    expect((fetcher.mock.calls[0] as unknown[])[1]).toEqual(
      new URLSearchParams({ limit: '50' }),
    )
  })
})
