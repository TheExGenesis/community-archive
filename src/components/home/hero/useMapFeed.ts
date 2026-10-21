'use client'
import { useEffect } from 'react'
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { mapUrl } from '@/lib/hexMap/version'
import { selectStories } from '@/lib/hexMap/selectStories'
import type { StoryPage } from '@/lib/hexMap/stories'
import type { BestPeriod } from '@/lib/hexMap/periods'
import type { HexSnapshot } from '@/lib/hexMap/types'

type Page = { nextOffset: number | null }
const FRESH_MS = 30_000
const RETAIN_MS = 60_000

function pageOptions<T extends Page>(path: string, offset: number) {
  return queryOptions({
    queryKey: ['hex-feed-page', path, offset],
    queryFn: async ({ signal }): Promise<T> => {
      const response = await fetch(mapUrl(`${path}&offset=${offset}`), {
        signal,
      })
      if (!response.ok) throw new Error('Content unavailable')
      return response.json()
    },
    staleTime: FRESH_MS,
    gcTime: RETAIN_MS,
    retry: false,
  })
}
export async function loadPage<T extends Page>(
  client: QueryClient,
  path: string,
  offset: number,
  snapshot?: HexSnapshot | null,
): Promise<T> {
  if (snapshot && path.startsWith('stories?')) {
    const params = new URLSearchParams(path.slice('stories?'.length))
    const cells =
      params.get('cells')?.split(',').filter(Boolean).map(Number) ?? []
    if (cells.length) {
      // Every cluster reads the same editions. Share the checked browse request
      // (including an in-flight one), then apply the API's exact selection rule.
      const page = await client.fetchQuery(
        pageOptions<StoryPage>(`stories?kind=${params.get('kind')}`, offset),
      )
      if (page.located)
        return selectStories(page, cells, snapshot) as unknown as T
      // An unlocated browse page is useful globally, but cannot prove a match.
      // Retry the strict selection endpoint instead of caching a false empty.
    }
  }
  return client.fetchQuery(pageOptions<T>(path, offset))
}
function feedOptions<T extends Page>(
  client: QueryClient,
  path: string,
  snapshot?: HexSnapshot | null,
) {
  return infiniteQueryOptions({
    queryKey: ['hex-feed', path],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadPage<T>(client, path, pageParam, snapshot),
    getNextPageParam: (page: T) => page.nextOffset,
    staleTime: FRESH_MS,
    gcTime: RETAIN_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function prefetchMapFeed(
  client: QueryClient,
  path: string,
  snapshot?: HexSnapshot | null,
) {
  return client.prefetchInfiniteQuery(feedOptions(client, path, snapshot))
}
export function selectionFeedPath(
  tab: string,
  cells: string,
  period: BestPeriod = 'week',
) {
  return tab === 'Stories' || tab === 'Strands'
    ? `stories?kind=${tab === 'Stories' ? 'digest' : 'strand'}&cells=${cells}`
    : `posts?cells=${cells}&sort=${tab === 'Bangers' ? 'quotes' : tab === 'Latest' ? 'time' : 'likes'}${tab === 'Bangers' || tab === 'Most liked' ? `&period=${period}` : ''}`
}

export function useMapFeed<T extends Page>(
  path: string,
  enabled = true,
  snapshot?: HexSnapshot | null,
) {
  const client = useQueryClient()
  const query = useInfiniteQuery({
    ...feedOptions<T>(client, path, snapshot),
    enabled,
  })
  const next = query.data?.pages.at(-1)?.nextOffset
  // Buffer exactly one page without appending it or recursively scanning ahead.
  // The sentinel consumes the same query/promise, so scrolling never duplicates it.
  useEffect(() => {
    if (enabled && next != null)
      void loadPage<T>(client, path, next, snapshot).catch(() => {})
  }, [client, enabled, path, next, snapshot])
  return query
}
