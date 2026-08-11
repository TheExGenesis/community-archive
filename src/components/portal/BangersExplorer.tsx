'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type {
  PortalBangersPage,
  PortalBangersPeriod,
  PortalBangersScope,
  PortalBangersSort,
  PortalTweet,
} from '@/lib/portal/types'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const requestVersionRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const columnLoadMoreRefs = useRef<Array<HTMLDivElement | null>>([])
  const isAllTime = allTime || (period === undefined && year === undefined)

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
      visibleTweets.reduce<
        [
          Array<{ tweet: PortalTweet; order: number }>,
          Array<{ tweet: PortalTweet; order: number }>,
        ]
      >(
        (columns, tweet, order) => {
          columns[order % 2].push({ tweet, order })
          return columns
        },
        [[], []],
      ),
    [visibleTweets],
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
    const targets = [loadMoreRef.current, ...columnLoadMoreRefs.current].filter(
      (target): target is HTMLDivElement => Boolean(target),
    )
    if (targets.length === 0 || page.pagination.nextOffset === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '700px 0px' },
    )
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [loadMore, page.pagination.nextOffset])

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    [],
  )

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
    setQuery('')
    if (year !== undefined || period !== undefined) {
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
      <div className={`${CARD} mb-6 p-4 shadow-sm sm:p-5`}>
        <label className="block">
          <span
            className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
          >
            Search
          </span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all ranked bangers…"
              className="h-10 w-full rounded-[3px] border border-zinc-300 bg-transparent pl-9 pr-9 text-[14px] outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-[#3a3a40]"
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
          </span>
        </label>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label>
            <span
              className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
            >
              When
            </span>
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
                className="h-9 w-[132px] rounded-[3px] border-zinc-300 bg-transparent px-3 text-[12px] font-semibold shadow-none focus:ring-brand/30 focus:ring-offset-0 dark:border-[#3a3a40]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[3px]">
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="three-months">Last 3 months</SelectItem>
                {availableYears.map((availableYear) => (
                  <SelectItem
                    key={availableYear}
                    value={`year-${availableYear}`}
                  >
                    {availableYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 lg:justify-end">
            <div>
              <span
                className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
              >
                Rank
              </span>
              <div className="flex">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={bangersHref({
                          query,
                          scope,
                          sort: 'quotes',
                          year,
                          period,
                          allTime: isAllTime,
                        })}
                        aria-current={sort === 'quotes' ? 'page' : undefined}
                        className={`${segmentClassName} rounded-l-[3px] ${
                          sort === 'quotes'
                            ? activeSegmentClassName
                            : idleSegmentClassName
                        }`}
                      >
                        Best
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Best means most quoted by distinct archive uploaders and
                      opted-in members. Quotes by the original author do not
                      count.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Link
                  href={bangersHref({
                    query,
                    scope,
                    sort: 'recent',
                    year,
                    period,
                    allTime: isAllTime,
                  })}
                  aria-current={sort === 'recent' ? 'page' : undefined}
                  className={`${segmentClassName} -ml-px rounded-r-[3px] ${
                    sort === 'recent'
                      ? activeSegmentClassName
                      : idleSegmentClassName
                  }`}
                >
                  Recent
                </Link>
              </div>
            </div>

            <div>
              <span
                className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
              >
                Tweets by
              </span>
              <div className="flex">
                <Link
                  href={bangersHref({
                    query,
                    scope: 'all',
                    sort,
                    year,
                    period,
                    allTime: isAllTime,
                  })}
                  aria-current={scope === 'all' ? 'page' : undefined}
                  className={`${segmentClassName} rounded-l-[3px] ${
                    scope === 'all'
                      ? activeSegmentClassName
                      : idleSegmentClassName
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
        </div>
      </div>

      <div className="min-h-7 mb-4 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p aria-live="polite" className={`text-[12.5px] tabular-nums ${MUTED}`}>
          {isSearching
            ? 'Searching ranked bangers…'
            : `Showing ${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()} ranked ${totalCount === 1 ? 'tweet' : 'tweets'}`}
          {!isSearching && period === 'today' ? ' from the last 24 hours' : ''}
          {!isSearching && period === 'week' ? ' from the last 7 days' : ''}
          {!isSearching && period === 'three-months'
            ? ' from the last 3 months'
            : ''}
          {!isSearching && !period && year !== undefined ? ` from ${year}` : ''}
          {!isSearching && loadedQuery ? ` matching “${loadedQuery}”` : ''}
          {!isSearching && page.pagination.candidateRankingTruncated
            ? ` · top ${page.pagination.snapshotSize.toLocaleString()} candidate snapshot`
            : ''}
        </p>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12px] font-semibold text-brand hover:underline"
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
          className="flex flex-col lg:grid lg:grid-cols-2 lg:items-start lg:gap-5"
        >
          {masonryColumns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              data-testid={`bangers-masonry-column-${columnIndex}`}
              className="contents lg:block lg:space-y-6"
            >
              {column.map(({ tweet, order }) => (
                <div
                  key={tweet.id}
                  data-masonry-order={order + 1}
                  className="mb-6 lg:mb-0"
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
              <div
                ref={(element) => {
                  columnLoadMoreRefs.current[columnIndex] = element
                }}
                data-testid={`bangers-column-sentinel-${columnIndex}`}
                aria-hidden="true"
                className="hidden h-px lg:block"
              />
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
            onClick={retryLoad}
            className="mt-2 text-[12px] font-semibold text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {page.pagination.nextOffset !== null ? (
        <div
          ref={loadMoreRef}
          className="min-h-20 flex items-center justify-center py-5"
        >
          <button
            type="button"
            onClick={loadMore}
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
