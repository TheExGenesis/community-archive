import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMapFeed } from './useMapFeed'

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
