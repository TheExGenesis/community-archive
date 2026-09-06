'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { BangersInfoTip } from '@/components/portal/BangersInfoTip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  PortalBangersPage,
  PortalBangersPeriod,
  PortalBangersScope,
  PortalBangersSort,
  PortalTweet,
} from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'
import { CARD, MUTED } from './styles'

interface BangersExplorerProps {
  initialPage: PortalBangersPage
  scope: PortalBangersScope
  sort: PortalBangersSort
  currentYear: number
  year?: number
  period?: PortalBangersPeriod
  allTime?: boolean
  initialQuery?: string
}

const segmentClassName =
  'inline-flex h-9 items-center justify-center gap-1.5 border px-3 text-[12px] font-semibold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
const activeSegmentClassName =
  'border-zinc-800 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
const idleSegmentClassName =
  'border-zinc-300 bg-transparent text-zinc-600 hover:border-zinc-500 hover:text-zinc-950 dark:border-[#3a3a40] dark:text-[#a7a7b4] dark:hover:border-zinc-500 dark:hover:text-white'
const masonryBreakpoints = [
  { query: '(min-width: 1280px)', columns: 3 },
  { query: '(min-width: 1024px)', columns: 2 },
] as const

type BangersAction =
  | 'filters_cleared'
  | 'load_more_clicked'
  | 'retry_clicked'
  | 'scope_changed'
  | 'searched'
  | 'time_filter_changed'

function captureBangersAction({
  action,
  query,
  scope,
  sort,
  year,
  period,
  resultCount,
}: {
  action: BangersAction
  query: string
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
  period?: PortalBangersPeriod
  resultCount: number
}) {
  capturePostHogEvent('bangers_action', {
    action,
    has_query: Boolean(query.trim()),
    time_range:
      period === 'three-months'
        ? 'three_months'
        : (period ?? (year === undefined ? 'all' : 'year')),
    sort,
    scope,
    result_count: resultCount,
  })
}

function matchesQuery(tweet: PortalTweet, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return `${tweet.name} ${tweet.username} ${tweet.text}`
    .toLocaleLowerCase()
    .includes(normalized)
}

function dedupeTweets(tweets: PortalTweet[]): PortalTweet[] {
  return Array.from(new Map(tweets.map((tweet) => [tweet.id, tweet])).values())
}

function useMasonryColumnCount(): number {
  const [columnCount, setColumnCount] = useState(1)

  useEffect(() => {
    const mediaQueries = masonryBreakpoints.map(({ query, columns }) => ({
      media: window.matchMedia(query),
      columns,
    }))
    const updateColumnCount = () => {
      setColumnCount(
        mediaQueries.find(({ media }) => media.matches)?.columns ?? 1,
      )
    }

    updateColumnCount()
    mediaQueries.forEach(({ media }) =>
      media.addEventListener('change', updateColumnCount),
    )
    return () =>
      mediaQueries.forEach(({ media }) =>
        media.removeEventListener('change', updateColumnCount),
      )
  }, [])

  return columnCount
}

function bangersHeading({
  year,
  period,
}: {
  year?: number
  period?: PortalBangersPeriod
}): string {
  if (period === 'today') return 'Best of the last 24 hours'
  if (period === 'week') return 'Best of the last 7 days'
  if (period === 'three-months') return 'Best of the last 3 months'
  if (year !== undefined) return `Best of ${year}`
  return 'Best of all time'
}

function bangersHref({
  query,
  scope,
  sort,
  year,
  period,
  allTime,
}: {
  query: string
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
  period?: PortalBangersPeriod
  allTime?: boolean
}): string {
  const params = new URLSearchParams()
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  if (scope === 'members') params.set('scope', scope)
  if (sort === 'recent') params.set('sort', sort)
  if (period) params.set('period', period)
  else if (year !== undefined) params.set('year', String(year))
  else if (allTime) params.set('period', 'all')
  const search = params.toString()
  return `/bangers${search ? `?${search}` : ''}`
}

function apiHref({
  offset,
  query,
  scope,
  sort,
  year,
  period,
}: {
  offset: number
  query: string
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
  period?: PortalBangersPeriod
}): string {
  const params = new URLSearchParams({
    offset: String(offset),
    scope,
    sort,
  })
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  if (period) params.set('period', period)
  else if (year !== undefined) params.set('year', String(year))
  return `/api/portal/bangers?${params.toString()}`
}

export function BangersExplorer({
  initialPage,
  scope,
  sort,
  currentYear,
  year,
  period,
  allTime = false,
  initialQuery = '',
}: BangersExplorerProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [loadedQuery, setLoadedQuery] = useState(initialQuery.trim())
  const [page, setPage] = useState(initialPage)
  const [isLoading, setIsLoading] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const requestVersionRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const isAllTime = allTime || (period === undefined && year === undefined)
  const masonryColumnCount = useMasonryColumnCount()

  const availableYears = useMemo(() => {
    const years = page.pagination.yearCounts.map(({ year }) => year)
    if (year !== undefined && !years.includes(year)) years.push(year)
    if (period) {
      for (
        let availableYear = currentYear;
        availableYear >= 2006;
        availableYear -= 1
      ) {
        if (!years.includes(availableYear)) years.push(availableYear)
      }
    }
    return years.sort((left, right) => right - left)
  }, [currentYear, page.pagination.yearCounts, period, year])
  const visibleTweets = useMemo(
    () => page.tweets.filter((tweet) => matchesQuery(tweet, query)),
    [page.tweets, query],
  )
  const masonryColumns = useMemo(
    () =>
      visibleTweets.reduce<Array<Array<{ tweet: PortalTweet; order: number }>>>(
        (columns, tweet, order) => {
          columns[order % masonryColumnCount].push({ tweet, order })
          return columns
        },
        Array.from({ length: masonryColumnCount }, () => []),
      ),
    [masonryColumnCount, visibleTweets],
  )
  const tweetRanks = useMemo(
    () =>
      new Map(
        page.tweets.map((tweet, index) => [tweet.id, index + 1] as const),
      ),
    [page.tweets],
  )

  const requestPage = useCallback(
    async ({
      offset,
      requestQuery,
      replace,
    }: {
      offset: number
      requestQuery: string
      replace: boolean
    }) => {
      if (!replace && loadingRef.current) return
      if (replace) requestControllerRef.current?.abort()

      const controller = new AbortController()
      const requestVersion = ++requestVersionRef.current
      requestControllerRef.current = controller
      loadingRef.current = true
      setIsLoading(true)
      setLoadError(null)

      try {
        const response = await fetch(
          apiHref({ offset, query: requestQuery, scope, sort, year, period }),
          { signal: controller.signal },
        )
        const result = (await response.json()) as PortalBangersPage & {
          error?: string
        }
        if (!response.ok) {
          throw new Error(result.error || 'Unable to load more bangers')
        }
        if (requestVersion !== requestVersionRef.current) return

        setLoadedQuery(requestQuery.trim())
        setPage((current) => ({
          ...result,
          tweets: replace
            ? result.tweets
            : dedupeTweets([...current.tweets, ...result.tweets]),
        }))
        if (replace) {
          captureBangersAction({
            action: 'searched',
            query: requestQuery,
            scope,
            sort,
            year,
            period,
            resultCount: result.pagination.totalAvailable,
          })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (requestVersion === requestVersionRef.current) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load more bangers',
          )
        }
      } finally {
        if (requestVersion === requestVersionRef.current) {
          loadingRef.current = false
          setIsLoading(false)
        }
      }
    },
    [period, scope, sort, year],
  )

  const loadMore = useCallback(() => {
    const nextOffset = page.pagination.nextOffset
    if (nextOffset === null || query.trim() !== loadedQuery) return
    void requestPage({
      offset: nextOffset,
      requestQuery: loadedQuery,
      replace: false,
    })
  }, [loadedQuery, page.pagination.nextOffset, query, requestPage])
  const retryLoad = () => {
    const nextQuery = query.trim()
    if (nextQuery !== loadedQuery) {
      void requestPage({ offset: 0, requestQuery: nextQuery, replace: true })
      return
    }
    loadMore()
  }

  useEffect(() => {
    const nextQuery = query.trim()
    if (nextQuery === loadedQuery) return
    const timeout = window.setTimeout(() => {
      void requestPage({ offset: 0, requestQuery: nextQuery, replace: true })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [loadedQuery, query, requestPage])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || page.pagination.nextOffset === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '700px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadMore, page.pagination.nextOffset])

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    setIsNavigating(false)
  }, [allTime, period, scope, sort, year])

  useEffect(() => {
    const nextUrl = bangersHref({
      query,
      scope,
      sort,
      year,
      period,
      allTime: isAllTime,
    })
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [isAllTime, period, query, scope, sort, year])

  const hasFilters =
    query.trim().length > 0 || year !== undefined || period !== undefined
  const selectedTime = period ?? (year === undefined ? 'all' : `year-${year}`)
  const clearFilters = () => {
    captureBangersAction({
      action: 'filters_cleared',
      query,
      scope,
      sort,
      year,
      period,
      resultCount: page.pagination.totalAvailable,
    })
    setQuery('')
    if (year !== undefined || period !== undefined) {
      setIsNavigating(true)
      router.push(bangersHref({ query: '', scope, sort, allTime: true }))
    }
  }
  const isSearching = query.trim() !== loadedQuery
  const loadedCount = page.tweets.length
  const totalCount = page.pagination.totalAvailable
  const currentReturnTo = bangersHref({
    query,
    scope,
    sort,
    year,
    period,
    allTime: isAllTime,
  })
  return (
    <section aria-label="Browse bangers">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:w-[280px]">
          <span className="sr-only">Search</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all ranked bangers…"
            className="h-9 w-full rounded-[3px] border border-zinc-300 bg-transparent pl-9 pr-9 text-[14px] outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-[#3a3a40]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-[#303036] dark:hover:text-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedTime}
            onValueChange={(value) => {
              const nextPeriod =
                value === 'today' ||
                value === 'week' ||
                value === 'three-months'
                  ? value
                  : undefined
              const nextYear = value.startsWith('year-')
                ? Number(value.slice(5))
                : undefined
              captureBangersAction({
                action: 'time_filter_changed',
                query,
                scope,
                sort,
                year: nextYear,
                period: nextPeriod,
                resultCount: page.pagination.totalAvailable,
              })
              setIsNavigating(true)
              router.push(
                bangersHref({
                  query,
                  scope,
                  sort,
                  year: nextYear,
                  period: nextPeriod,
                  allTime: value === 'all',
                }),
              )
            }}
          >
            <SelectTrigger
              aria-label="Filter by time"
              aria-busy={isNavigating}
              disabled={isNavigating}
              className="h-9 w-auto gap-2 rounded-[3px] border-zinc-300 bg-transparent px-3 text-[12px] font-semibold shadow-none focus:ring-brand/30 focus:ring-offset-0 dark:border-[#3a3a40]"
            >
              <SelectValue />
              {isNavigating ? (
                <Loader2
                  aria-label="Loading bangers"
                  className="ml-auto h-3.5 w-3.5 animate-spin"
                />
              ) : null}
            </SelectTrigger>
            <SelectContent className="rounded-[3px]">
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="three-months">Last 3 months</SelectItem>
              {availableYears.map((availableYear) => (
                <SelectItem key={availableYear} value={`year-${availableYear}`}>
                  {availableYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex" role="group" aria-label="Tweets by">
            <Link
              href={bangersHref({
                query,
                scope: 'all',
                sort,
                year,
                period,
                allTime: isAllTime,
              })}
              onClick={(event) => {
                const href = event.currentTarget.getAttribute('href')
                if (scope !== 'all') {
                  captureBangersAction({
                    action: 'scope_changed',
                    query,
                    scope: 'all',
                    sort,
                    year,
                    period,
                    resultCount: page.pagination.totalAvailable,
                  })
                }
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  href !== currentReturnTo
                ) {
                  setIsNavigating(true)
                }
              }}
              aria-current={scope === 'all' ? 'page' : undefined}
              className={`${segmentClassName} rounded-l-[3px] ${
                scope === 'all' ? activeSegmentClassName : idleSegmentClassName
              }`}
            >
              Anyone
            </Link>
            <Link
              href={bangersHref({
                query,
                scope: 'members',
                sort,
                year,
                period,
                allTime: isAllTime,
              })}
              onClick={(event) => {
                const href = event.currentTarget.getAttribute('href')
                if (scope !== 'members') {
                  captureBangersAction({
                    action: 'scope_changed',
                    query,
                    scope: 'members',
                    sort,
                    year,
                    period,
                    resultCount: page.pagination.totalAvailable,
                  })
                }
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  href !== currentReturnTo
                ) {
                  setIsNavigating(true)
                }
              }}
              aria-current={scope === 'members' ? 'page' : undefined}
              className={`${segmentClassName} -ml-px rounded-r-[3px] ${
                scope === 'members'
                  ? activeSegmentClassName
                  : idleSegmentClassName
              }`}
            >
              Archive members
            </Link>
          </div>
        </div>
      </div>

      <div className="min-h-12 mb-4 flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-[19px] font-bold uppercase tracking-[0.035em]">
              {bangersHeading({ year, period })}
            </h2>
            <BangersInfoTip />
          </div>
          <p
            aria-live="polite"
            className={`mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] tabular-nums ${MUTED}`}
          >
            {isNavigating ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
                Loading bangers…
              </>
            ) : isSearching ? (
              'Searching ranked bangers…'
            ) : (
              `Showing ${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()} ranked ${totalCount === 1 ? 'tweet' : 'tweets'}`
            )}
            {!isNavigating && !isSearching && period === 'today'
              ? ' from the last 24 hours'
              : ''}
            {!isNavigating && !isSearching && period === 'week'
              ? ' from the last 7 days'
              : ''}
            {!isNavigating && !isSearching && period === 'three-months'
              ? ' from the last 3 months'
              : ''}
            {!isNavigating && !isSearching && !period && year !== undefined
              ? ` from ${year}`
              : ''}
            {!isNavigating && !isSearching && loadedQuery
              ? ` matching “${loadedQuery}”`
              : ''}
            {!isNavigating &&
            !isSearching &&
            page.pagination.candidateRankingTruncated
              ? ` · top ${page.pagination.snapshotSize.toLocaleString()} candidate snapshot`
              : ''}
          </p>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12px] font-semibold text-brand"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {visibleTweets.length === 0 && !isLoading && !isSearching ? (
        <div className={`${CARD} px-4 py-16 text-center`}>
          <p className="text-[14px] font-semibold">No bangers found</p>
          <p className={`mt-1 text-[13px] ${MUTED}`}>
            Try another search, time period, or author scope.
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-[3px] border border-zinc-300 bg-transparent px-3 py-1.5 text-[12.5px] font-semibold hover:border-brand hover:text-brand dark:border-[#3a3a40]"
            >
              Show all bangers
            </button>
          ) : null}
        </div>
      ) : (
        <div
          data-testid="bangers-masonry"
          className="grid items-start gap-3 lg:gap-4"
          style={{
            gridTemplateColumns: `repeat(${masonryColumnCount}, minmax(0, 1fr))`,
          }}
        >
          {masonryColumns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              data-testid={`bangers-masonry-column-${columnIndex}`}
              className="contents lg:block lg:space-y-4"
            >
              {column.map(({ tweet, order }) => (
                <div
                  key={tweet.id}
                  data-masonry-order={order + 1}
                  style={{ order }}
                >
                  <TweetCard
                    tweet={tweet}
                    featuredRank={tweetRanks.get(tweet.id)}
                    showDate
                    collapsible
                    origin="bangers"
                    returnTo={currentReturnTo}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {loadError ? (
        <div className="mt-4 text-center">
          <p className="text-[12.5px] text-red-600 dark:text-red-400">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              captureBangersAction({
                action: 'retry_clicked',
                query,
                scope,
                sort,
                year,
                period,
                resultCount: page.pagination.totalAvailable,
              })
              retryLoad()
            }}
            className="mt-2 text-[12px] font-semibold text-brand"
          >
            Try again
          </button>
        </div>
      ) : null}

      {page.pagination.nextOffset !== null ? (
        <div
          ref={loadMoreRef}
          data-testid="bangers-load-more-sentinel"
          className="min-h-20 flex items-center justify-center py-5"
        >
          <button
            type="button"
            onClick={() => {
              captureBangersAction({
                action: 'load_more_clicked',
                query,
                scope,
                sort,
                year,
                period,
                resultCount: page.pagination.totalAvailable,
              })
              loadMore()
            }}
            disabled={isLoading || query.trim() !== loadedQuery}
            className="inline-flex items-center gap-2 rounded-[3px] border border-zinc-300 bg-transparent px-4 py-2 text-[12.5px] font-semibold hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60 dark:border-[#3a3a40]"
          >
            {isLoading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            {isLoading ? 'Loading…' : 'Load more bangers'}
          </button>
        </div>
      ) : loadedCount > 0 ? (
        <p className={`py-6 text-center text-[11.5px] ${MUTED}`}>
          All {totalCount.toLocaleString()} matching bangers loaded
          {page.pagination.candidateRankingTruncated
            ? ' from the current snapshot'
            : ''}
          .
        </p>
      ) : null}
    </section>
  )
}
