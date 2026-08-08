'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { CHART_TERMS } from '@/lib/portal/trendConfig'
import type { PortalTrends, PortalTweet, TermSeries } from '@/lib/portal/types'
import { TweetRow } from './TweetRow'
import { BODY, CARD, MUTED, SERIF } from './styles'

type FeedFilter = 'include' | 'exclude' | 'off'
type TrendScale = 'raw' | 'normalized'

interface SeriesResponse {
  years: number[]
  series: TermSeries[]
  computedAt: string
  error?: string
}

interface FeedResponse {
  tweets: PortalTweet[]
  error?: string
}

const MAX_SERIES = 12
const compactAxisFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const plainAxisFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
})
const SERIES_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#a78bfa',
  '#f87171',
  '#2acf80',
  '#38bdf8',
  '#e879f9',
  '#fb7185',
  '#14b8a6',
  '#8b5cf6',
  '#f97316',
  '#84cc16',
]
const DEFAULT_TREND_TERMS = CHART_TERMS.map(({ term }) => term)

async function requestTrendSeries(terms: string[]): Promise<SeriesResponse> {
  const params = new URLSearchParams({ view: 'series' })
  terms.forEach((term) => params.append('q', term))
  const response = await fetch(`/api/portal/trends?${params.toString()}`)
  const body = (await response
    .json()
    .catch(() => null)) as SeriesResponse | null
  if (!response.ok) {
    throw new Error(body?.error || 'Could not load those trends')
  }
  if (!body || !Array.isArray(body.years) || !Array.isArray(body.series)) {
    throw new Error('The trends service returned an invalid response')
  }
  return body
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function compactAxis(value: number): string {
  return (value >= 1_000 ? compactAxisFormatter : plainAxisFormatter).format(
    value,
  )
}

function nextFeedFilter(filter: FeedFilter): FeedFilter {
  if (filter === 'off') return 'include'
  if (filter === 'include') return 'exclude'
  return 'off'
}

function filterLabel(term: string, filter: FeedFilter): string {
  if (filter === 'include') return `${term} is included. Click to exclude it.`
  if (filter === 'exclude') return `${term} is excluded. Click to turn it off.`
  return `${term} is off. Click to include it.`
}

export default function TrendsExplorer({
  initialTrends,
  initialLoadFailed = false,
}: {
  initialTrends: PortalTrends
  initialLoadFailed?: boolean
}) {
  const [years, setYears] = useState(initialTrends.years)
  const [series, setSeries] = useState(initialTrends.series)
  const [chartEnabled, setChartEnabled] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        initialTrends.series.map(({ term }, index) => [term, index < 4]),
      ),
  )
  const [feedFilters, setFeedFilters] = useState<Record<string, FeedFilter>>(
    () =>
      Object.fromEntries(
        initialTrends.series.map(({ term }, index) => [
          term,
          index === 0 ? 'include' : 'off',
        ]),
      ),
  )
  const [scale, setScale] = useState<TrendScale>('normalized')
  const [termInput, setTermInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isRetryingDefaults, setIsRetryingDefaults] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [chartError, setChartError] = useState<string | null>(
    initialLoadFailed ? 'The default trends could not be loaded.' : null,
  )
  const [evidence, setEvidence] = useState<PortalTweet[]>([])
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const enabledSeries = useMemo(
    () => series.filter(({ term }) => chartEnabled[term]),
    [chartEnabled, series],
  )
  const includeTerms = useMemo(
    () =>
      series
        .map(({ term }) => term)
        .filter((term) => feedFilters[term] === 'include'),
    [feedFilters, series],
  )
  const excludeTerms = useMemo(
    () =>
      series
        .map(({ term }) => term)
        .filter((term) => feedFilters[term] === 'exclude'),
    [feedFilters, series],
  )

  useEffect(() => {
    if (includeTerms.length === 0) {
      setEvidence([])
      setFeedError(null)
      setIsLoadingEvidence(false)
      return
    }

    const controller = new AbortController()
    const loadEvidence = async () => {
      setIsLoadingEvidence(true)
      setFeedError(null)
      const params = new URLSearchParams({ view: 'feed' })
      includeTerms.forEach((term) => params.append('include', term))
      excludeTerms.forEach((term) => params.append('exclude', term))

      try {
        const response = await fetch(
          `/api/portal/trends?${params.toString()}`,
          {
            signal: controller.signal,
          },
        )
        const body = (await response
          .json()
          .catch(() => null)) as FeedResponse | null
        if (!response.ok) {
          throw new Error(body?.error || 'Could not load matching tweets')
        }
        if (!body || !Array.isArray(body.tweets)) {
          throw new Error('The tweet feed returned an invalid response')
        }
        setEvidence(body.tweets)
      } catch (error) {
        if (controller.signal.aborted) return
        setEvidence([])
        setFeedError(
          error instanceof Error
            ? error.message
            : 'Could not load matching tweets',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoadingEvidence(false)
      }
    }

    void loadEvidence()
    return () => controller.abort()
  }, [excludeTerms, includeTerms, refreshKey])

  const addTerms = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAddError(null)

    const requested = Array.from(
      new Set(
        termInput
          .split(',')
          .map((term) => term.trim().toLocaleLowerCase())
          .filter(Boolean),
      ),
    )
    if (requested.length === 0) {
      setAddError('Enter at least one word or phrase.')
      return
    }

    const existing = new Set(series.map(({ term }) => term))
    const alreadyPresent = requested.filter((term) => existing.has(term))
    const newTerms = requested.filter((term) => !existing.has(term))
    if (series.length + newTerms.length > MAX_SERIES) {
      setAddError(`Show up to ${MAX_SERIES} trends at once.`)
      return
    }

    if (alreadyPresent.length > 0) {
      setChartEnabled((current) => ({
        ...current,
        ...Object.fromEntries(alreadyPresent.map((term) => [term, true])),
      }))
    }
    if (newTerms.length === 0) {
      setTermInput('')
      return
    }

    setIsAdding(true)
    try {
      const body = await requestTrendSeries(newTerms)

      const firstColorIndex = series.length
      const additions = body.series.map((item, index) => ({
        ...item,
        color: SERIES_COLORS[(firstColorIndex + index) % SERIES_COLORS.length],
      }))
      setYears(body.years)
      setSeries((current) => [...current, ...additions])
      setChartEnabled((current) => ({
        ...current,
        ...Object.fromEntries(additions.map(({ term }) => [term, true])),
      }))
      setFeedFilters((current) => ({
        ...current,
        ...Object.fromEntries(
          additions.map(({ term }) => [term, 'include' as const]),
        ),
      }))
      setChartError(null)
      setTermInput('')
    } catch (error) {
      setAddError(
        error instanceof Error ? error.message : 'Could not add those trends',
      )
    } finally {
      setIsAdding(false)
    }
  }

  const retryDefaultTrends = async () => {
    setIsRetryingDefaults(true)
    try {
      const body = await requestTrendSeries(DEFAULT_TREND_TERMS)
      const defaultColors = new Map(
        CHART_TERMS.map(({ term, color }) => [term, color]),
      )
      const defaults = body.series.map((item) => ({
        ...item,
        color: defaultColors.get(item.term) ?? item.color,
      }))
      setYears(body.years)
      setSeries(defaults)
      setChartEnabled(
        Object.fromEntries(
          defaults.map(({ term }, index) => [term, index < 4]),
        ),
      )
      setFeedFilters(
        Object.fromEntries(
          defaults.map(({ term }, index) => [
            term,
            index === 0 ? 'include' : 'off',
          ]),
        ),
      )
      setChartError(null)
    } catch (error) {
      setChartError(
        error instanceof Error
          ? error.message
          : 'The default trends could not be loaded.',
      )
    } finally {
      setIsRetryingDefaults(false)
    }
  }

  const valuesFor = (item: TermSeries) =>
    scale === 'normalized' ? item.perYear : item.tweetsPerYear
  const maxValue = Math.max(
    1,
    ...enabledSeries.flatMap((item) => valuesFor(item)),
  )
  const chartMax = niceCeiling(maxValue)
  const gridValues = [
    0,
    chartMax / 4,
    chartMax / 2,
    (chartMax * 3) / 4,
    chartMax,
  ]
  const W = 760
  const H = 360
  const X0 = 62
  const X1 = 732
  const Y0 = 326
  const Y1 = 24
  const xPositions = years.map(
    (_, index) => X0 + (index * (X1 - X0)) / Math.max(years.length - 1, 1),
  )
  const yPosition = (value: number) => Y0 - (value / chartMax) * (Y0 - Y1)

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
        <Link
          href="/"
          className={`mb-2 inline-flex items-center text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[30px] font-semibold" style={SERIF}>
              Trends explorer
            </h1>
            <p className={`mt-1 max-w-[680px] text-[13.5px] ${MUTED}`}>
              Compare the archive’s vocabulary over time, then inspect the posts
              behind each line.
            </p>
          </div>
          <div className={`text-[12px] ${MUTED}`}>
            Full corpus · {years[0]}–{years.at(-1)}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <section className="min-w-0">
            <div className={`${CARD} mb-4 p-4 sm:p-5`}>
              <form
                onSubmit={addTerms}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <label className="sr-only" htmlFor="trend-terms">
                  Words or phrases to chart
                </label>
                <input
                  id="trend-terms"
                  value={termInput}
                  onChange={(event) => setTermInput(event.target.value)}
                  placeholder="Add words or phrases, separated by commas"
                  maxLength={500}
                  className="focus:ring-brand/15 h-10 min-w-0 flex-1 rounded-[4px] border border-zinc-300 bg-white px-3 text-[13.5px] outline-none transition-colors placeholder:text-zinc-400 focus:border-brand focus:ring-2 dark:border-[#34343a] dark:bg-[#121214]"
                />
                <button
                  type="submit"
                  disabled={isAdding || isRetryingDefaults}
                  className="h-10 rounded-[4px] bg-brand px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAdding ? 'Adding…' : 'Add trends'}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-[11.5px] ${addError ? 'text-red-600 dark:text-red-400' : MUTED}`}
                >
                  {addError ||
                    'Multi-word trends match all words; up to four distinct words are counted.'}
                </span>
                <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
                  {series.length}/{MAX_SERIES} trends
                </span>
              </div>
            </div>

            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3.5 dark:border-[#26262a] sm:px-5">
                <div>
                  <h2 className="text-[14px] font-bold">
                    {scale === 'normalized'
                      ? 'Frequency per 100k tweets'
                      : 'Matching tweets by year'}
                  </h2>
                  <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                    {scale === 'normalized'
                      ? 'Adjusted for the archive’s changing annual volume.'
                      : 'Raw matching tweet count in each calendar year.'}
                  </p>
                </div>
                <div
                  className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
                  aria-label="Trend scale"
                >
                  {(['raw', 'normalized'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={scale === option}
                      onClick={() => setScale(option)}
                      className={`rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                        scale === option
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : `${MUTED} hover:text-foreground`
                      }`}
                    >
                      {option === 'raw' ? 'Raw count' : 'Per 100k'}
                    </button>
                  ))}
                </div>
              </div>

              {chartError && (
                <div
                  className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100 sm:mx-5"
                  role="alert"
                >
                  <div className="text-[12.5px]">
                    <span className="font-bold">Chart data unavailable.</span>{' '}
                    {chartError} Retry this chart without reloading the page;
                    other dashboard areas are unaffected.
                  </div>
                  {series.length === 0 && (
                    <button
                      type="button"
                      onClick={() => void retryDefaultTrends()}
                      disabled={isRetryingDefaults}
                      className="rounded-[4px] border border-amber-400 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      {isRetryingDefaults ? 'Retrying…' : 'Retry defaults'}
                    </button>
                  )}
                </div>
              )}

              <div className="px-2 pb-1 pt-3 sm:px-4">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="block w-full"
                  role="img"
                  aria-label={`Yearly term trends shown as ${scale === 'normalized' ? 'occurrences per 100,000 tweets' : 'raw tweet counts'}`}
                >
                  {gridValues.map((value) => (
                    <g key={value}>
                      <line
                        x1={X0 - 5}
                        y1={yPosition(value)}
                        x2={X1}
                        y2={yPosition(value)}
                        className="stroke-zinc-200 dark:stroke-[#202023]"
                        strokeWidth={1}
                      />
                      <text
                        x={X0 - 10}
                        y={yPosition(value) + 4}
                        textAnchor="end"
                        fontSize={10}
                        className="fill-zinc-400 dark:fill-[#6d6d78]"
                      >
                        {compactAxis(value)}
                      </text>
                    </g>
                  ))}
                  {years.map((year, index) => (
                    <text
                      key={year}
                      x={xPositions[index]}
                      y={350}
                      textAnchor="middle"
                      fontSize={11}
                      className="fill-zinc-400 dark:fill-[#6d6d78]"
                    >
                      {year}
                    </text>
                  ))}
                  {enabledSeries.map((item) => {
                    const values = valuesFor(item)
                    return (
                      <g key={item.term}>
                        <polyline
                          fill="none"
                          stroke={item.color}
                          strokeWidth={2.75}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={values
                            .map(
                              (value, index) =>
                                `${xPositions[index]},${yPosition(value).toFixed(1)}`,
                            )
                            .join(' ')}
                        />
                        {values.map((value, index) => (
                          <circle
                            key={years[index]}
                            cx={xPositions[index]}
                            cy={yPosition(value)}
                            r={3}
                            fill={item.color}
                            className="stroke-white dark:stroke-[#1b1b1e]"
                            strokeWidth={1.5}
                            aria-label={`${item.term} · ${years[index]} · ${
                              scale === 'normalized'
                                ? `${compactAxis(value)} per 100k`
                                : `${Math.round(value).toLocaleString('en-US')} tweets`
                            }`}
                          />
                        ))}
                      </g>
                    )
                  })}
                  {enabledSeries.length === 0 && (
                    <text
                      x={(X0 + X1) / 2}
                      y={(Y0 + Y1) / 2}
                      textAnchor="middle"
                      fontSize={13}
                      className="fill-zinc-400 dark:fill-[#6d6d78]"
                    >
                      {series.length === 0
                        ? 'Add a trend above to start charting.'
                        : 'Select a trend below to draw it.'}
                    </text>
                  )}
                </svg>
              </div>

              <div className="border-t border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
                <div
                  className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${MUTED}`}
                >
                  Series shown
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {series.map((item) => {
                    const active = !!chartEnabled[item.term]
                    return (
                      <button
                        key={item.term}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setChartEnabled((current) => ({
                            ...current,
                            [item.term]: !current[item.term],
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                          active
                            ? 'border-zinc-400 bg-zinc-50 text-foreground dark:border-[#45454c] dark:bg-[#202024]'
                            : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: item.color,
                            opacity: active ? 1 : 0.3,
                          }}
                        />
                        {item.term}
                      </button>
                    )
                  })}
                  {series.length === 0 && (
                    <span className={`py-1 text-[12px] ${MUTED}`}>
                      No trend series loaded.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className={`mt-3 text-[12px] leading-relaxed ${BODY}`}>
              Normalization divides each term’s annual count by all archived
              tweets from that year, then scales the result to 100,000. This
              makes years with different archive coverage comparable.
            </p>
          </section>

          <aside className="min-w-0 lg:sticky lg:top-20">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold" style={SERIF}>
                  Tweets counted
                </h2>
                <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                  Latest posts matching any included trend.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                disabled={isLoadingEvidence || includeTerms.length === 0}
                className={`text-[11.5px] font-semibold ${MUTED} hover:text-brand disabled:opacity-40`}
              >
                Refresh
              </button>
            </div>

            <div className={`${CARD} mb-3 p-3`}>
              <div className="flex flex-wrap gap-1.5">
                {series.map(({ term }) => {
                  const filter = feedFilters[term] ?? 'off'
                  return (
                    <button
                      key={term}
                      type="button"
                      aria-label={filterLabel(term, filter)}
                      onClick={() =>
                        setFeedFilters((current) => ({
                          ...current,
                          [term]: nextFeedFilter(current[term] ?? 'off'),
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                        filter === 'include'
                          ? 'border-brand bg-brand/10 text-blue-700 dark:text-blue-300'
                          : filter === 'exclude'
                            ? 'border-red-400 bg-red-50 text-red-700 dark:border-red-500/70 dark:bg-red-950/30 dark:text-red-300'
                            : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                      }`}
                    >
                      {filter === 'include'
                        ? '+ '
                        : filter === 'exclude'
                          ? '− '
                          : ''}
                      {term}
                    </button>
                  )
                })}
              </div>
              <div className={`mt-2.5 text-[10.5px] leading-normal ${MUTED}`}>
                Click a pill to cycle: include → exclude → off. Includes are OR;
                exclusions remove matching posts.
              </div>
            </div>

            <div
              className={`${CARD} max-h-[760px] overflow-y-auto`}
              aria-live="polite"
            >
              {isLoadingEvidence && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Finding matching tweets…
                </div>
              )}
              {!isLoadingEvidence && includeTerms.length === 0 && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Include at least one term to inspect its tweets.
                </div>
              )}
              {!isLoadingEvidence && feedError && (
                <div className="px-4 py-10 text-center text-[13px] text-red-600 dark:text-red-400">
                  {feedError}
                </div>
              )}
              {!isLoadingEvidence &&
                !feedError &&
                includeTerms.length > 0 &&
                evidence.length === 0 && (
                  <div
                    className={`px-4 py-12 text-center text-[13px] ${MUTED}`}
                  >
                    No matching tweets after exclusions.
                  </div>
                )}
              {!isLoadingEvidence &&
                !feedError &&
                evidence.map((tweet) => (
                  <TweetRow key={tweet.id} tweet={tweet} collapsible />
                ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
