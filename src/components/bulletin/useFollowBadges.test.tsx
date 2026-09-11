import { act, renderHook, waitFor } from '@testing-library/react'
import { useFollowBadges } from './useFollowBadges'

const graph = { outgoing: { '7': 12 }, available: true }
afterEach(() => jest.restoreAllMocks())

test('cards keep their ranking immediately while optional badges load independently', async () => {
  let resolve!: (value: unknown) => void
  global.fetch = jest.fn().mockReturnValue(
    new Promise((r) => {
      resolve = r
    }),
  )
  const { result, rerender } = renderHook(() => useFollowBadges(graph, true))
  expect(result.current).toEqual(graph)
  rerender()
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () =>
    resolve({
      ok: true,
      json: async () => ({ following: ['7'], followers: ['8'] }),
    }),
  )
  await waitFor(() => expect(result.current.following).toEqual(['7']))
  expect(result.current.outgoing).toBe(graph.outgoing)
})

test('unmount cancels badge loading and a failed request leaves cards usable', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Unavailable'))
  const { result, unmount } = renderHook(() => useFollowBadges(graph, true))
  await act(async () => {})
  expect(result.current).toEqual(graph)
  const signal = jest.mocked(fetch).mock.calls[0][1]!.signal!
  unmount()
  expect(signal.aborted).toBe(true)
})
