'use client'
import { queryOptions } from '@tanstack/react-query'
import type { MapStory, StoryDetail } from '@/lib/hexMap/stories'
import { mapUrl } from '@/lib/hexMap/version'

export function storyDetailOptions(story: MapStory | null) {
  return queryOptions({
    queryKey: ['hex-map-story', story?.kind, story?.id],
    queryFn: async ({ signal }): Promise<StoryDetail> => {
      if (!story) throw new Error('Choose a story')
      const response = await fetch(
        mapUrl(`story?kind=${story.kind}&id=${encodeURIComponent(story.id)}`),
        { signal },
      )
      if (!response.ok) throw new Error('Content unavailable')
      return response.json()
    },
    // Same short policy-freshness window as map feeds; no persistent storage.
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

// Only visible cards are warmed, at most two concurrent reads.
let running = 0
const queue: Array<() => Promise<unknown>> = []
export function warmStory(load: () => Promise<unknown>) {
  queue.push(load)
  drain()
}
function drain() {
  while (running < 2 && queue.length) {
    const load = queue.shift()!
    running++
    void load()
      .catch(() => {})
      .finally(() => {
        running--
        drain()
      })
  }
}
