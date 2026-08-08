'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Columns3, List, Search, X } from 'lucide-react'
import type { PortalTweet } from '@/lib/portal/types'
import { TweetRow } from './TweetRow'
import { CARD, MUTED, SERIF } from './styles'

type BangersSort = 'quotes' | 'likes' | 'reposts' | 'recent'
type BangersView = 'list' | 'years'

interface BangersExplorerProps {
  tweets: PortalTweet[]
  initialQuery?: string
  initialSort?: string
  initialYear?: string
  initialView?: BangersView
}

const SORT_OPTIONS: Array<{ value: BangersSort; label: string }> = [
  { value: 'quotes', label: 'Archive quotes' },
  { value: 'likes', label: 'Likes' },
  { value: 'reposts', label: 'Reposts' },
  { value: 'recent', label: 'Newest' },
]

const selectClassName =
  'h-9 rounded-[4px] border border-zinc-300 bg-white px-3 text-[13px] font-semibold text-zinc-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-[#3a3a40] dark:bg-[#1b1b1e] dark:text-[#eeeeef]'

function tweetYear(tweet: PortalTweet): number | null {
  const year = new Date(tweet.createdAt).getUTCFullYear()
  return Number.isFinite(year) ? year : null
}

function sortBangers(
  left: PortalTweet,
  right: PortalTweet,
  sort: BangersSort,
): number {
  const quoteDifference = (right.quoteCount ?? 0) - (left.quoteCount ?? 0)
  const likeDifference = right.likes - left.likes
  const repostDifference = right.rts - left.rts
  const recentDifference =
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()

  if (sort === 'likes') {
    return likeDifference || quoteDifference || recentDifference
  }
  if (sort === 'reposts') {
    return repostDifference || quoteDifference || recentDifference
  }
  if (sort === 'recent') {
    return recentDifference || quoteDifference || likeDifference
  }
  return quoteDifference || likeDifference || recentDifference
}

export function filterAndSortBangers(
  tweets: PortalTweet[],
  query: string,
  year: string,
  sort: BangersSort,
): PortalTweet[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const selectedYear = year === 'all' ? null : Number(year)

  return tweets
    .filter((tweet) => {
      if (selectedYear !== null && tweetYear(tweet) !== selectedYear) {
        return false
      }
      if (!normalizedQuery) return true
      return `${tweet.name} ${tweet.username} ${tweet.text}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
    .sort((left, right) => sortBangers(left, right, sort))
}

function pluralizeTweets(count: number): string {
  return `${count} ${count === 1 ? 'tweet' : 'tweets'}`
}

export function BangersExplorer({
  tweets,
  initialQuery = '',
  initialSort = 'quotes',
  initialYear = 'all',
  initialView = 'list',
}: BangersExplorerProps) {
  const years = useMemo(
    () =>
      Array.from(
        new Set(
          tweets.map(tweetYear).filter((year): year is number => year !== null),
        ),
      ).sort((left, right) => right - left),
    [tweets],
  )
  const [query, setQuery] = useState(initialQuery)
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<BangersSort>(() =>
    SORT_OPTIONS.some(({ value }) => value === initialSort)
      ? (initialSort as BangersSort)
      : 'quotes',
  )
  const [year, setYear] = useState(() =>
    years.includes(Number(initialYear)) ? initialYear : 'all',
  )
  const [view, setView] = useState<BangersView>(initialView)

  const filteredTweets = useMemo(
    () => filterAndSortBangers(tweets, deferredQuery, year, sort),
    [deferredQuery, sort, tweets, year],
  )
  const groupedTweets = useMemo(() => {
    const groups = new Map<number, PortalTweet[]>()
    for (const tweet of filteredTweets) {
      const groupYear = tweetYear(tweet)
      if (groupYear === null) continue
      const group = groups.get(groupYear) ?? []
      group.push(tweet)
      groups.set(groupYear, group)
    }
    return Array.from(groups.entries()).sort(
      ([leftYear], [rightYear]) => rightYear - leftYear,
    )
  }, [filteredTweets])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const trimmedQuery = query.trim()

    if (trimmedQuery) params.set('q', trimmedQuery)
    else params.delete('q')
    if (sort === 'quotes') params.delete('sort')
    else params.set('sort', sort)
    if (year === 'all') params.delete('year')
    else params.set('year', year)
    if (view === 'list') params.delete('view')
    else params.set('view', view)

    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [query, sort, view, year])

  const hasFilters = query.trim().length > 0 || year !== 'all'
  const clearFilters = () => {
    setQuery('')
    setYear('all')
  }

  return (
    <section aria-label="Browse bangers">
      <div className={`${CARD} mb-4 p-3 sm:p-4`}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="min-w-0 flex-1">
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
                placeholder="Search tweets or people…"
                className="h-10 w-full rounded-[4px] border border-zinc-300 bg-zinc-50 pl-9 pr-9 text-[14px] outline-none transition placeholder:text-zinc-400 focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20 dark:border-[#3a3a40] dark:bg-[#151518] dark:focus:bg-[#18181b]"
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

          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <label>
              <span
                className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
              >
                Year
              </span>
              <select
                aria-label="Filter by year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className={`${selectClassName} w-full sm:w-[120px]`}
              >
                <option value="all">All years</option>
                {years.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>
                    {availableYear}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span
                className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
              >
                Sort by
              </span>
              <select
                aria-label="Sort bangers"
                value={sort}
                onChange={(event) => setSort(event.target.value as BangersSort)}
                className={`${selectClassName} w-full sm:w-[150px]`}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="col-span-2">
              <span
                className={`mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
              >
                View
              </span>
              <div
                role="group"
                aria-label="Choose bangers view"
                className="flex h-9 rounded-[4px] border border-zinc-300 bg-zinc-100 p-0.5 dark:border-[#3a3a40] dark:bg-[#151518]"
              >
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[3px] px-2.5 text-[12px] font-semibold transition sm:flex-none ${
                    view === 'list'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-[#303036] dark:text-white'
                      : `${MUTED} hover:text-zinc-800 dark:hover:text-white`
                  }`}
                >
                  <List aria-hidden="true" className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'years'}
                  onClick={() => setView('years')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[3px] px-2.5 text-[12px] font-semibold transition sm:flex-none ${
                    view === 'years'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-[#303036] dark:text-white'
                      : `${MUTED} hover:text-zinc-800 dark:hover:text-white`
                  }`}
                >
                  <Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
                  By year
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-7 mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p aria-live="polite" className={`text-[12.5px] tabular-nums ${MUTED}`}>
          Showing {pluralizeTweets(filteredTweets.length)}
          {year !== 'all' ? ` from ${year}` : ''}
          {query.trim() ? ` matching “${query.trim()}”` : ''}
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

      {filteredTweets.length === 0 ? (
        <div className={`${CARD} px-4 py-16 text-center`}>
          <p className="text-[14px] font-semibold">No bangers found</p>
          <p className={`mt-1 text-[13px] ${MUTED}`}>
            Try another search or year.
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-[4px] border border-zinc-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:border-brand hover:text-brand dark:border-[#3a3a40] dark:bg-[#202023]"
            >
              Show all bangers
            </button>
          ) : null}
        </div>
      ) : view === 'list' ? (
        <div className={`${CARD} mx-auto max-w-[900px] overflow-hidden`}>
          {filteredTweets.map((tweet) => (
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
            {groupedTweets.map(([groupYear, yearTweets]) => (
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
                    {pluralizeTweets(yearTweets.length)}
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
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
