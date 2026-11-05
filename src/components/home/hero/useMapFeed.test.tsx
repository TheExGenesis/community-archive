import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMapFeed, prefetchMapFeed } from './useMapFeed'
import type { StoryPage, MapStory } from '@/lib/hexMap/stories'
import type { HexSnapshot } from '@/lib/hexMap/types'

it('buffers one page, reuses it on scroll, and retains a visited tab without duplicate requests', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async (url: string) => {
    const offset = Number(
      new URL(url, 'http://localhost').searchParams.get('offset'),
    )
    return {
      ok: true,
      json: async () => ({
        tweets: [offset],
        nextOffset: offset < 24 ? offset + 12 : null,
      }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  try {
    const { result, rerender, unmount } = renderHook(
      ({ path }) =>
        useMapFeed<{ tweets: number[]; nextOffset: number | null }>(path),
      { initialProps: { path: 'posts?cells=1&sort=likes' }, wrapper },
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.data?.pages).toHaveLength(1)
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(result.current.data?.pages.flatMap((p) => p.tweets)).toEqual([0, 12])
    rerender({ path: 'stories?kind=digest&cells=1' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    rerender({ path: 'posts?cells=1&sort=likes' })
    expect(result.current.data?.pages.flatMap((p) => p.tweets)).toEqual([0, 12])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    unmount()
  } finally {
    client.clear()
    global.fetch = originalFetch
  }
})

const snapshot = {
  cells: [{ region: 1 }, { region: 1 }, { region: 2 }],
} as HexSnapshot
const story = (id: string, cell: number) => ({ id, cells: [cell] }) as MapStory
const browsePage: StoryPage = {
  stories: [story('near', 0), story('far', 2)],
  editions: [],
  nextOffset: null,
  located: true,
}

it('shares checked browse data across clusters, keeps fallback and never mutates the browse page', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => browsePage,
  }))
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  try {
    await prefetchMapFeed(client, 'stories?kind=digest')
    const { result, rerender, unmount } = renderHook(
      ({ cells }) =>
        useMapFeed<StoryPage>(
          `stories?kind=digest&cells=${cells}`,
          true,
          snapshot,
        ),
      {
        initialProps: { cells: '0' },
        wrapper,
      },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].stories.map((s) => s.id)).toEqual([
      'near',
    ])
    expect(result.current.data?.pages[0].countryFallback).toBe(false)
    rerender({ cells: '1' })
    await waitFor(() =>
      expect(result.current.data?.pages[0].countryFallback).toBe(true),
    )
    expect(result.current.data?.pages[0].stories.map((s) => s.id)).toEqual([
      'near',
    ])
    rerender({ cells: '2' })
    await waitFor(() =>
      expect(result.current.data?.pages[0].stories[0].id).toBe('far'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(browsePage.stories).toHaveLength(2)
    expect(browsePage.countryFallback).toBeUndefined()
    unmount()
  } finally {
    client.clear()
    global.fetch = originalFetch
  }
})

it('retries the strict endpoint when browse locations are missing and never shows unrelated stories', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async (url: string) => ({
    ok: !url.includes('cells='),
    json: async () => ({ ...browsePage, located: false }),
  }))
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  try {
    const { result, unmount } = renderHook(
      () =>
        useMapFeed<StoryPage>('stories?kind=digest&cells=0', true, snapshot),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unmount()
  } finally {
    client.clear()
    global.fetch = originalFetch
  }
})
