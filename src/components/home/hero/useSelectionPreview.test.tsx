import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSelectionPreview } from './useSelectionPreview'

it('cancels passing intent and deduplicates preloading with the click', async () => {
  jest.useFakeTimers()
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ nextOffset: null, people: [] }),
  }))
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  try {
    const { result, unmount } = renderHook(
      () => useSelectionPreview('Latest'),
      { wrapper },
    )
    act(() => {
      result.current.onSelectionIntent([2])
      jest.advanceTimersByTime(100)
      result.current.onSelectionIntent(null)
      jest.advanceTimersByTime(200)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      result.current.onSelectionIntent([3, 1])
      jest.advanceTimersByTime(180)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      result.current.preloadSelection([1, 3])
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      fetchMock.mock.calls.map((call) => (call as unknown as [string])[0]),
    ).toEqual([
      expect.stringContaining('posts?cells=1,3&sort=time'),
      expect.stringContaining('lookup?cells=1,3'),
    ])
    act(() => {
      result.current.onSelectionIntent([4])
    })
    unmount()
    act(() => {
      jest.advanceTimersByTime(200)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  } finally {
    client.clear()
    global.fetch = originalFetch
    jest.useRealTimers()
  }
})
