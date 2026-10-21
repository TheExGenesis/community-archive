import { QueryClient } from '@tanstack/react-query'
import { storyDetailOptions } from './useStoryDetail'
import type { MapStory } from '@/lib/hexMap/stories'

it('shares visible-card preloading with opening and reopening, then rechecks after invalidation', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ tweets: [] }),
  }))
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const options = storyDetailOptions({
    kind: 'digest',
    id: '2026-10-21/example',
  } as MapStory)
  try {
    await Promise.all([
      client.prefetchQuery(options),
      client.fetchQuery(options),
    ])
    await client.fetchQuery(options)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await client.invalidateQueries({ queryKey: options.queryKey })
    await client.fetchQuery(options)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  } finally {
    client.clear()
    global.fetch = originalFetch
  }
})
