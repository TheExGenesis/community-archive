import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { MapHeat } from '@/lib/hexMap/gateway'
import { MAP_VERSION, mapUrl } from '@/lib/hexMap/version'

export function mapHeatOptions(term: string) {
  const normalized = term.trim().toLowerCase().slice(0, 80)
  return queryOptions({
    queryKey: ['hex-map-heat', MAP_VERSION, normalized],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        mapUrl(`heat?q=${encodeURIComponent(normalized)}`),
        { signal },
      )
      if (!response.ok) throw new Error('Heat map unavailable')
      const data: MapHeat = await response.json()
      if (data.version !== MAP_VERSION) throw new Error('Map version changed')
      // Prepare every month once, before hover or playback needs to paint it.
      const byMonth = data.months.map(() => new Map<number, number>())
      for (const [cell, month, uses, total] of data.values)
        byMonth[month]?.set(cell, total ? uses / total : 0)
      return { ...data, byMonth }
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export async function preloadTrendHeat(
  client: QueryClient,
  terms: string[],
  signal: AbortSignal,
) {
  const queue = Array.from(
    new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 12)
  // Warm just the displayed trends, with bounded load on the analytical gateway.
  async function worker() {
    while (!signal.aborted && queue.length) {
      await client.prefetchQuery(mapHeatOptions(queue.shift()!))
    }
  }
  await Promise.all([worker(), worker()])
}
