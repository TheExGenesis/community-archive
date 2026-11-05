import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useRankedFeed, rankedFeedRows } from './useRankedFeed'
import { prefetchMapFeed } from './useMapFeed'
import type { BestPeriod } from '@/lib/hexMap/periods'

const originalFetch = global.fetch
let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
})
afterEach(() => {
  client.clear()
  global.fetch = originalFetch
})
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const page = (ids: string[], nextOffset: number | null = null) => ({
  tweets: ids.map((id) => ({ tweet: { id }, cell: 2 })),
  nextOffset,
})

it('reuses the warmed first page, falls back to weekly likes, widens on scroll, and never repeats a tweet', async () => {
  const fetchMock = jest.fn(async (url: string) => {
    const p = new URL(url, 'http://localhost').searchParams
    const period = p.get('period'),
      sort = p.get('sort'),
      offset = p.get('offset')
    return {
      ok: true,
      json: async () =>
        period === 'week'
          ? sort === 'quotes'
            ? page([])
            : offset === '0'
              ? page(['week-like'], 12)
              : page(['week-like-2'])
          : period === 'month'
            ? page(['week-like', 'month-best'])
            : period === 'quarter'
              ? page(['month-best', 'quarter-best'])
              : period === 'year'
                ? page(['year-best'])
                : page(['quarter-best', 'all-best']),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  await prefetchMapFeed(client, 'posts?cells=2&sort=quotes&period=week')
  const { result, rerender } = renderHook(
    ({ cells, period }) => useRankedFeed(cells, period, true),
    {
      wrapper,
      initialProps: { cells: '2', period: 'week' as BestPeriod },
    },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(
    rankedFeedRows(result.current.data!.pages).map((r) => r.heading),
  ).toEqual(['Most liked · last 7 days'])
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  expect(result.current.data!.pages).toHaveLength(1) // one buffered page, not appended
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data!.pages).toHaveLength(i + 2))
  }
  expect(result.current.hasNextPage).toBe(false)
  expect(
    rankedFeedRows(result.current.data!.pages).map((r) => r.tweet.id),
  ).toEqual([
    'week-like',
    'week-like-2',
    'month-best',
    'quarter-best',
    'year-best',
    'all-best',
  ])
  expect(fetchMock).toHaveBeenCalledTimes(7)
  rerender({ cells: '2', period: 'all' })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(
    rankedFeedRows(result.current.data!.pages).map((r) => r.tweet.id),
  ).toEqual(['quarter-best', 'all-best'])
  expect(fetchMock).toHaveBeenCalledTimes(7) // raw pages shared between range choices
  rerender({ cells: '3', period: 'week' })
  expect(result.current.data).toBeUndefined() // no previous selection leaked
})

it.each(['quotes', 'likes'] as const)(
  'exhausts empty candidate pages and preserves %s errors for retry',
  async (ranking) => {
    let fail = true
    const fetchMock = jest.fn(async (url: string) => {
      const p = new URL(url, 'http://localhost').searchParams
      const offset = p.get('offset')
      return {
        ok: offset === '0' || !fail,
        json: async () => (offset === '0' ? page([], 12) : page(['ranked'])),
      }
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { result } = renderHook(
      () => useRankedFeed('2', 'week', true, ranking),
      {
        wrapper,
      },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true))
    expect(
      fetchMock.mock.calls.every(([url]) => url.includes(`sort=${ranking}`)),
    ).toBe(true)
    fail = false
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() =>
      expect(
        rankedFeedRows(result.current.data!.pages).map((r) => r.tweet.id),
      ).toEqual(['ranked']),
    )
    expect(result.current.data!.pages[1].sort).toBe(ranking)
  },
)

it('widens Most liked after each exhausted range, preserves posts, and deduplicates overlapping and duplicate-only pages', async () => {
  const fetchMock = jest.fn(async (url: string) => {
    const params = new URL(url, 'http://localhost').searchParams
    const period = params.get('period')
    return {
      ok: true,
      json: async () =>
        period === 'week'
          ? page(['weekly'])
          : period === 'month'
            ? params.get('offset') === '0'
              ? page(['weekly'], 12)
              : page(['monthly', 'weekly'])
            : period === 'quarter'
              ? page([])
              : period === 'year'
                ? page(['yearly', 'monthly'])
                : page(['weekly', 'lifetime']),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  await prefetchMapFeed(client, 'posts?cells=2&sort=likes&period=week')
  const { result, rerender } = renderHook(
    ({ period }) => useRankedFeed('2', period, true, 'likes'),
    { wrapper, initialProps: { period: 'week' as BestPeriod } },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data!.pages).toHaveLength(i + 2))
  }
  expect(result.current.hasNextPage).toBe(false)
  expect(
    rankedFeedRows(result.current.data!.pages).map((r) => [
      r.tweet.id,
      r.heading,
    ]),
  ).toEqual([
    ['weekly', 'Most liked · last 7 days'],
    ['monthly', 'Most liked · last month'],
    ['yearly', 'Most liked · last year'],
    ['lifetime', 'Most liked · all time'],
  ])
  expect(fetchMock).toHaveBeenCalledTimes(6)
  expect(
    fetchMock.mock.calls.every(([url]) => url.includes('sort=likes')),
  ).toBe(true)
  rerender({ period: 'all' })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(
    rankedFeedRows(result.current.data!.pages).map((r) => r.tweet.id),
  ).toEqual(['weekly', 'lifetime'])
  expect(fetchMock).toHaveBeenCalledTimes(6)
})
