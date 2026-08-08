'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, List, Loader2, Search, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  PortalBangersPage,
  PortalBangersScope,
  PortalBangersSort,
  PortalTweet,
} from '@/lib/portal/types'
import { TweetRow } from './TweetRow'
import { CARD, MUTED, SERIF } from './styles'

type BangersView = 'list' | 'years'

interface BangersExplorerProps {
  initialPage: PortalBangersPage
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
  initialQuery?: string
  initialView?: BangersView
}

const segmentClassName =
  'inline-flex h-9 items-center justify-center gap-1.5 border px-3 text-[12px] font-semibold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
const activeSegmentClassName =
  'border-zinc-800 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
const idleSegmentClassName =
  'border-zinc-300 bg-transparent text-zinc-600 hover:border-zinc-500 hover:text-zinc-950 dark:border-[#3a3a40] dark:text-[#a7a7b4] dark:hover:border-zinc-500 dark:hover:text-white'

function tweetYear(tweet: PortalTweet): number | null {
  const year = new Date(tweet.createdAt).getUTCFullYear()
  return Number.isFinite(year) ? year : null
}

function matchesQuery(tweet: PortalTweet, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return `${tweet.name} ${tweet.username} ${tweet.text}`
    .toLocaleLowerCase()
    .includes(normalized)
}

function pluralizeTweets(count: number): string {
  return `${count} ${count === 1 ? 'tweet' : 'tweets'}`
}

function dedupeTweets(tweets: PortalTweet[]): PortalTweet[] {
  return Array.from(new Map(tweets.map((tweet) => [tweet.id, tweet])).values())
}

function bangersHref({
  query,
  scope,
  sort,
  year,
  view,
}: {
  query: string
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
  view: BangersView
}): string {
  const params = new URLSearchParams()
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  if (scope === 'members') params.set('scope', scope)
  if (sort === 'recent') params.set('sort', sort)
  if (year !== undefined) params.set('year', String(year))
  if (view === 'years') params.set('view', view)
  const search = params.toString()
  return `/bangers${search ? `?${search}` : ''}`
}

function apiHref({
  offset,
  query,
  scope,
  sort,
  year,
}: {
  offset: number
  query: string
  scope: PortalBangersScope
  sort: PortalBangersSort
  year?: number
}): string {
  const params = new URLSearchParams({
    offset: String(offset),
    scope,
    sort,
  })
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  if (year !== undefined) params.set('year', String(year))
  return `/api/portal/bangers?${params.toString()}`
}

export function BangersExplorer({
  initialPage,
  scope,
  sort,
  year,
  initialQuery = '',
  initialView = 'list',
}: BangersExplorerProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [loadedQuery, setLoadedQuery] = useState(initialQuery.trim())
  const [view, setView] = useState<BangersView>(initialView)
  const [page, setPage] = useState(initialPage)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const requestVersionRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const availableYears = useMemo(() => {
    const years = page.pagination.yearCounts.map(({ year }) => year)
    if (year !== undefined && !years.includes(year)) years.push(year)
    return years.sort((left, right) => right - left)
  }, [page.pagination.yearCounts, year])
  const yearTotals = useMemo(
    () =>
      new Map(
        page.pagination.yearCounts.map(({ year, count }) => [year, count]),
      ),
    [page.pagination.yearCounts],
  )
  const visibleTweets = useMemo(
    () => page.tweets.filter((tweet) => matchesQuery(tweet, query)),
    [page.tweets, query],
  )
  const groupedTweets = useMemo(() => {
    const groups = new Map<number, PortalTweet[]>()
    for (const tweet of visibleTweets) {
      const groupYear = tweetYear(tweet)
      if (groupYear === null) continue
      const group = groups.get(groupYear) ?? []
      group.push(tweet)
      groups.set(groupYear, group)
    }
    return Array.from(groups.entries()).sort(
      ([leftYear], [rightYear]) => rightYear - leftYear,
    )
  }, [visibleTweets])

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
          apiHref({ offset, query: requestQuery, scope, sort, year }),
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
    [scope, sort, year],
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
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
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
    const nextUrl = bangersHref({ query, scope, sort, year, view })
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [query, scope, sort, view, year])

  const hasFilters = query.trim().length > 0 || year !== undefined
  const selectedYear = year === undefined ? 'all' : String(year)
  const clearFilters = () => {
    setQuery('')
    if (year !== undefined) {
      router.push(bangersHref({ query: '', scope, sort, view }))
    }
  }
  const isSearching = query.trim() !== loadedQuery
  const loadedCount = page.tweets.length
  const totalCount = page.pagination.totalAvailable

  return (
    <section aria-label="Browse bangers">
      <div className={`${CARD} mb-4 p-3 sm:p-4`}>
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

        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <span
              className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
            >
              Tweets by
            </span>
            <div className="flex">
              <Link
                href={bangersHref({ query, scope: 'all', sort, year, view })}
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
                  view,
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

          <div>
            <span
              className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
            >
              Rank
            </span>
            <div className="flex">
              <Link
                href={bangersHref({ query, scope, sort: 'quotes', year, view })}
                aria-current={sort === 'quotes' ? 'page' : undefined}
                className={`${segmentClassName} rounded-l-[3px] ${
                  sort === 'quotes'
                    ? activeSegmentClassName
                    : idleSegmentClassName
                }`}
              >
                Most quoted
              </Link>
              <Link
                href={bangersHref({ query, scope, sort: 'recent', year, view })}
                aria-current={sort === 'recent' ? 'page' : undefined}
                className={`${segmentClassName} -ml-px rounded-r-[3px] ${
                  sort === 'recent'
                    ? activeSegmentClassName
                    : idleSegmentClassName
                }`}
              >
                Most recent
              </Link>
            </div>
          </div>

          <label>
            <span
              className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
            >
              Year
            </span>
            <Select
              value={selectedYear}
              onValueChange={(value) =>
                router.push(
                  bangersHref({
                    query,
                    scope,
                    sort,
                    year: value === 'all' ? undefined : Number(value),
                    view,
                  }),
                )
              }
            >
              <SelectTrigger
                aria-label="Filter by year"
                className="h-9 w-[122px] rounded-[3px] border-zinc-300 bg-transparent px-3 text-[12px] font-semibold shadow-none focus:ring-brand/30 focus:ring-offset-0 dark:border-[#3a3a40]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[3px]">
                <SelectItem value="all">All years</SelectItem>
                {availableYears.map((availableYear) => (
                  <SelectItem key={availableYear} value={String(availableYear)}>
                    {availableYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div>
            <span
              className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
            >
              View
            </span>
            <div className="flex">
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={`${segmentClassName} rounded-l-[3px] ${
                  view === 'list'
                    ? activeSegmentClassName
                    : idleSegmentClassName
                }`}
              >
                <List aria-hidden="true" className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                aria-pressed={view === 'years'}
                onClick={() => setView('years')}
                className={`${segmentClassName} -ml-px rounded-r-[3px] ${
                  view === 'years'
                    ? activeSegmentClassName
                    : idleSegmentClassName
                }`}
              >
                <Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
                By year
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-7 mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p aria-live="polite" className={`text-[12.5px] tabular-nums ${MUTED}`}>
          {isSearching
            ? 'Searching ranked bangers…'
            : `Showing ${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()} ranked ${totalCount === 1 ? 'tweet' : 'tweets'}`}
          {!isSearching && year !== undefined ? ` from ${year}` : ''}
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
            Try another search, year, or author scope.
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
      ) : view === 'list' ? (
        <div className={`${CARD} mx-auto max-w-[900px] overflow-hidden`}>
          {visibleTweets.map((tweet) => (
            <TweetRow key={tweet.id} tweet={tweet} showDate collapsible />
          ))}
        </div>
      ) : (
        <div>
          {groupedTweets.length > 1 ? (
            <p className={`mb-2 text-[11.5px] ${MUTED}`}>
              Scroll sideways to browse every year.
            </p>
          ) : null}
          <div className="grid auto-cols-[minmax(290px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4">
            {groupedTweets.map(([groupYear, yearTweets]) => {
              const yearTotal = yearTotals.get(groupYear) ?? yearTweets.length
              return (
                <section
                  key={groupYear}
                  aria-labelledby={`bangers-year-${groupYear}`}
                  className="min-w-0"
                >
                  <div className="mb-2 flex items-baseline justify-between border-b-2 border-zinc-800 pb-2 dark:border-zinc-200">
                    <h2
                      id={`bangers-year-${groupYear}`}
                      className="text-[22px] font-semibold"
                      style={SERIF}
                    >
                      {groupYear}
                    </h2>
                    <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
                      {yearTweets.length < yearTotal
                        ? `${yearTweets.length} of ${yearTotal} loaded`
                        : pluralizeTweets(yearTotal)}
                    </span>
                  </div>
                  <div className={`${CARD} overflow-hidden`}>
                    {yearTweets.map((tweet) => (
                      <TweetRow
                        key={tweet.id}
                        tweet={tweet}
                        showDate
                        collapsible
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
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
