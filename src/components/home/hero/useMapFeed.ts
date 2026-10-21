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
function feedOptions<T extends Page>(client: QueryClient, path: string) {
  return infiniteQueryOptions({
    queryKey: ['hex-feed', path],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client.fetchQuery(pageOptions<T>(path, pageParam)),
    getNextPageParam: (page: T) => page.nextOffset,
    staleTime: FRESH_MS,
    gcTime: RETAIN_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function prefetchMapFeed(client: QueryClient, path: string) {
  return client.prefetchInfiniteQuery(feedOptions(client, path))
}
export function selectionFeedPath(tab: string, cells: string) {
  return tab === 'Stories' || tab === 'Strands'
    ? `stories?kind=${tab === 'Stories' ? 'digest' : 'strand'}&cells=${cells}`
    : `posts?cells=${cells}&sort=${tab === 'Bangers' ? 'quotes' : tab === 'Latest' ? 'time' : 'likes'}`
}

export function useMapFeed<T extends Page>(path: string, enabled = true) {
  const client = useQueryClient()
  const query = useInfiniteQuery({ ...feedOptions<T>(client, path), enabled })
  const next = query.data?.pages.at(-1)?.nextOffset
  // Buffer exactly one page without appending it or recursively scanning ahead.
  // The sentinel consumes the same query/promise, so scrolling never duplicates it.
  useEffect(() => {
    if (enabled && next != null)
      void client.prefetchQuery(pageOptions<T>(path, next))
  }, [client, enabled, path, next])
  return query
}
