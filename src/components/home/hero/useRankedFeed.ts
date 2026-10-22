'use client'
import { useEffect } from 'react'
import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  BEST_PERIODS,
  PERIOD_LABELS,
  type BestPeriod,
} from '@/lib/hexMap/periods'
import type { MapPostPage } from '@/lib/hexMap/stories'
import { loadPage } from './useMapFeed'

type Cursor = {
  period: BestPeriod
  sort: 'quotes' | 'likes'
  offset: number
  hasPosts: boolean
}
export type RankedPage = MapPostPage & {
  period: BestPeriod
  sort: Cursor['sort']
  next: Cursor | null
}

async function loadRankedPage(
  client: QueryClient,
  cells: string,
  cursor: Cursor,
  ranking: Cursor['sort'],
): Promise<RankedPage> {
  const { period, sort, offset } = cursor
  const page = await loadPage<MapPostPage>(
    client,
    `posts?cells=${cells}&sort=${sort}&period=${period}`,
    offset,
  )
  const hasPosts = cursor.hasPosts || page.tweets.length > 0
  // A failed request or an empty filtered candidate page is not proof that
  // the whole week is empty. Exhaust its cursor before trying most liked.
  if (
    period === 'week' &&
    sort === 'quotes' &&
    page.nextOffset === null &&
    !hasPosts
  )
    return loadRankedPage(
      client,
      cells,
      {
        period,
        sort: 'likes',
        offset: 0,
        hasPosts: false,
      },
      ranking,
    )
  const wider = BEST_PERIODS[BEST_PERIODS.indexOf(period) + 1]
  const next: Cursor | null =
    page.nextOffset !== null
      ? { ...cursor, offset: page.nextOffset, hasPosts }
      : wider
        ? { period: wider, sort: ranking, offset: 0, hasPosts: false }
        : null
  return { ...page, period, sort, next }
}

export function rankedFeedRows(pages: RankedPage[]) {
  const seen = new Set<string>()
  const headings = new Set<string>()
  return pages.flatMap((page) => {
    const key = `${page.period}:${page.sort}`
    return page.tweets.flatMap((row) => {
      if (seen.has(row.tweet.id)) return []
      seen.add(row.tweet.id)
      const heading = !headings.has(key)
        ? `${page.sort === 'likes' ? 'Most liked' : 'Best'} · ${PERIOD_LABELS[page.period].toLowerCase()}`
        : undefined
      headings.add(key)
      return [{ ...row, heading }]
    })
  })
}

export function useRankedFeed(
  cells: string,
  period: BestPeriod,
  enabled: boolean,
  ranking: Cursor['sort'] = 'quotes',
) {
  const client = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: ['hex-ranked-feed', cells, period, ranking],
    initialPageParam: {
      period,
      sort: ranking,
      offset: 0,
      hasPosts: false,
    } as Cursor,
    queryFn: ({ pageParam }) =>
      loadRankedPage(client, cells, pageParam, ranking),
    getNextPageParam: (page) => page.next,
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const next = query.data?.pages.at(-1)?.next
  // Reuse the existing raw page cache and buffer one continuation only.
  useEffect(() => {
    if (enabled && next)
      void loadRankedPage(client, cells, next, ranking).catch(() => {})
  }, [client, cells, enabled, next, ranking])
  return query
}
