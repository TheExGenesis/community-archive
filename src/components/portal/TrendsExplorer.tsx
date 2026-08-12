'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { CHART_TERMS } from '@/lib/portal/trendConfig'
import {
  cachedTrendEvidence,
  hasCompleteTrendEvidence,
  storeTrendEvidence,
  trendEvidenceCacheKey,
} from '@/lib/portal/trendEvidenceCache'
import type {
  TrendEvidenceCacheEntry,
  TrendEvidenceRange,
} from '@/lib/portal/trendEvidenceCache'
import type { PortalTrends, PortalTweet, TermSeries } from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'
import { BODY, CARD, MUTED, SERIF } from './styles'

type FeedFilter = 'include' | 'off'
type TrendScale = 'raw' | 'normalized'

type SelectedYears = TrendEvidenceRange

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
const EVIDENCE_PAGE_SIZE = 30
const RANGE_QUERY_DEBOUNCE_MS = 1_200
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

type TrendsExplorerAction =
  | 'chart_series_toggled'
  | 'evidence_filter_toggled'
  | 'evidence_refreshed'
  | 'retry_defaults'
  | 'scale_changed'
  | 'term_removed'
  | 'terms_added'
  | 'terms_reactivated'
  | 'year_filter_applied'
  | 'year_filter_cleared'

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

async function requestTrendEvidence(
  term: string,
  selectedYears: SelectedYears | null,
  signal: AbortSignal,
): Promise<PortalTweet[]> {
  const params = new URLSearchParams({ view: 'feed', include: term })
  if (selectedYears) {
    params.set('since', `${selectedYears.start}-01-01`)
    params.set('until', `${selectedYears.end + 1}-01-01`)
  }
  const response = await fetch(`/api/portal/trends?${params.toString()}`, {
    signal,
  })
  const body = (await response.json().catch(() => null)) as FeedResponse | null
  if (!response.ok) {
    throw new Error(body?.error || `Could not load tweets for ${term}`)
  }
  if (!body || !Array.isArray(body.tweets)) {
    throw new Error('The tweet feed returned an invalid response')
  }
  return body.tweets
}

function sameYears(
  left: SelectedYears | null,
  right: SelectedYears | null,
): boolean {
  return left?.start === right?.start && left?.end === right?.end
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
  return filter === 'off' ? 'include' : 'off'
}

function filterLabel(term: string, filter: FeedFilter): string {
  if (filter === 'include') return `${term} is included. Click to turn it off.`
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
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedYears, setSelectedYears] = useState<SelectedYears | null>(null)
  const [requestedYears, setRequestedYears] = useState<SelectedYears | null>(
    null,
  )
  const [, setEvidenceCacheVersion] = useState(0)
  const [dragStartYear, setDragStartYear] = useState<number | null>(null)
  const chartRef = useRef<SVGSVGElement>(null)
  const evidenceCacheRef = useRef<Map<string, TrendEvidenceCacheEntry>>(
    new Map(),
  )
  const evidenceRequestsRef = useRef(
    new Map<
      string,
      { controller: AbortController; promise: Promise<PortalTweet[]> }
    >(),
  )
  const evidenceRequestSignatureRef = useRef('')
  const handledRefreshKeyRef = useRef(0)

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
  const evidence = cachedTrendEvidence(
    evidenceCacheRef.current,
    includeTerms,
    selectedYears,
  )
  const captureExplorerAction = (
    action: TrendsExplorerAction,
    overrides: Partial<{
      seriesCount: number
      enabledSeriesCount: number
      includedSeriesCount: number
      hasYearFilter: boolean
    }> = {},
  ) => {
    capturePostHogEvent('trends_explorer_action', {
      action,
      series_count: overrides.seriesCount ?? series.length,
      enabled_series_count:
        overrides.enabledSeriesCount ?? enabledSeries.length,
      included_series_count:
        overrides.includedSeriesCount ?? includeTerms.length,
      has_year_filter: overrides.hasYearFilter ?? selectedYears !== null,
    })
  }

  useEffect(() => {
    const requests = evidenceRequestsRef.current
    return () => {
      requests.forEach(({ controller }) => controller.abort())
      requests.clear()
    }
  }, [])

  useEffect(() => {
    if (dragStartYear !== null || sameYears(selectedYears, requestedYears)) {
      return
    }
    setFeedError(null)
    const timeout = window.setTimeout(
      () => setRequestedYears(selectedYears),
      RANGE_QUERY_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [dragStartYear, requestedYears, selectedYears])

  useEffect(() => {
    const signature = JSON.stringify({
      includeTerms,
      requestedYears,
      refreshKey,
    })
    evidenceRequestSignatureRef.current = signature
    if (includeTerms.length === 0) {
      setFeedError(null)
      setIsLoadingEvidence(false)
      return
    }

    const forceRefresh = refreshKey !== handledRefreshKeyRef.current
    handledRefreshKeyRef.current = refreshKey
    const termsToLoad = includeTerms.filter(
      (term) =>
        forceRefresh ||
        !hasCompleteTrendEvidence(
          evidenceCacheRef.current,
          term,
          requestedYears,
          EVIDENCE_PAGE_SIZE,
        ),
    )
    if (termsToLoad.length === 0) {
      setFeedError(null)
      setIsLoadingEvidence(false)
      return
    }

    const loadEvidence = async () => {
      setIsLoadingEvidence(true)
      setFeedError(null)
      const results: PromiseSettledResult<PortalTweet[]>[] = []
      for (const term of termsToLoad) {
        const key = trendEvidenceCacheKey(term, requestedYears)
        let request = evidenceRequestsRef.current.get(key)
        if (!request) {
          const controller = new AbortController()
          let promise: Promise<PortalTweet[]>
          promise = requestTrendEvidence(
            term,
            requestedYears,
            controller.signal,
          )
            .then((tweets) => {
              storeTrendEvidence(evidenceCacheRef.current, {
                term,
                range: requestedYears,
                tweets,
              })
              setEvidenceCacheVersion((version) => version + 1)
              return tweets
            })
            .finally(() => {
              if (evidenceRequestsRef.current.get(key)?.promise === promise) {
                evidenceRequestsRef.current.delete(key)
              }
            })
          request = { controller, promise }
          evidenceRequestsRef.current.set(key, request)
        }
        try {
          results.push({ status: 'fulfilled', value: await request.promise })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      if (evidenceRequestSignatureRef.current !== signature) return
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      if (failure) {
        setFeedError(
          failure.reason instanceof Error
            ? failure.reason.message
            : 'Could not load matching tweets',
        )
      }
      setIsLoadingEvidence(
        includeTerms.some((term) =>
          evidenceRequestsRef.current.has(
            trendEvidenceCacheKey(term, requestedYears),
          ),
        ),
      )
    }

    void loadEvidence()
  }, [includeTerms, refreshKey, requestedYears])

  const removeTerm = (term: string) => {
    captureExplorerAction('term_removed', {
      seriesCount: Math.max(0, series.length - 1),
      enabledSeriesCount: Math.max(
        0,
        enabledSeries.length - (chartEnabled[term] ? 1 : 0),
      ),
      includedSeriesCount: Math.max(
        0,
        includeTerms.length - (feedFilters[term] === 'include' ? 1 : 0),
      ),
    })
    setSeries((current) => current.filter((item) => item.term !== term))
    setChartEnabled((current) => {
      const next = { ...current }
      delete next[term]
      return next
    })
    setFeedFilters((current) => {
      const next = { ...current }
      delete next[term]
      return next
    })
  }

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
      const nextEnabled = new Set([
        ...enabledSeries.map(({ term }) => term),
        ...alreadyPresent,
      ])
      captureExplorerAction('terms_reactivated', {
        enabledSeriesCount: nextEnabled.size,
      })
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
      const nextEnabled = new Set([
        ...enabledSeries.map(({ term }) => term),
        ...alreadyPresent,
        ...additions.map(({ term }) => term),
      ])
      const nextIncluded = new Set([
        ...includeTerms,
        ...additions.map(({ term }) => term),
      ])
      captureExplorerAction('terms_added', {
        seriesCount: series.length + additions.length,
        enabledSeriesCount: nextEnabled.size,
        includedSeriesCount: nextIncluded.size,
      })
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
      captureExplorerAction('retry_defaults', {
        seriesCount: defaults.length,
        enabledSeriesCount: Math.min(defaults.length, 4),
        includedSeriesCount: defaults.length > 0 ? 1 : 0,
      })
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
  const selectedStartIndex = selectedYears
    ? years.indexOf(selectedYears.start)
    : -1
  const selectedEndIndex = selectedYears ? years.indexOf(selectedYears.end) : -1
  const isUpdatingEvidence =
    includeTerms.length > 0 &&
    (isLoadingEvidence ||
      (!sameYears(selectedYears, requestedYears) &&
        includeTerms.some(
          (term) =>
            !hasCompleteTrendEvidence(
              evidenceCacheRef.current,
              term,
              selectedYears,
              EVIDENCE_PAGE_SIZE,
            ),
        )))

  const yearForPointer = (clientX: number): number | null => {
    const svg = chartRef.current
    if (!svg || years.length === 0) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const svgX = ((clientX - rect.left) / rect.width) * W
    const ratio = Math.max(0, Math.min(1, (svgX - X0) / (X1 - X0)))
    const index = Math.round(ratio * Math.max(years.length - 1, 0))
    return years[index] ?? null
  }

  const updateDraggedYears = (year: number, anchor = dragStartYear) => {
    if (anchor === null) return
    setSelectedYears({
      start: Math.min(anchor, year),
      end: Math.max(anchor, year),
    })
  }

  const beginRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    const year = yearForPointer(event.clientX)
    if (year === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragStartYear(year)
    setSelectedYears({ start: year, end: year })
  }

  const continueRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartYear === null) return
    const year = yearForPointer(event.clientX)
    if (year !== null) updateDraggedYears(year)
  }

  const finishRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartYear === null) return
    const year = yearForPointer(event.clientX)
    if (year !== null) updateDraggedYears(year)
    captureExplorerAction('year_filter_applied', { hasYearFilter: true })
    setDragStartYear(null)
  }

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
                      onClick={() => {
                        if (scale === option) return
                        captureExplorerAction('scale_changed')
                        setScale(option)
                      }}
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
                  ref={chartRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className="block w-full touch-none select-none"
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
                  {selectedYears &&
                    selectedStartIndex >= 0 &&
                    selectedEndIndex >= 0 && (
                      <rect
                        x={Math.max(
                          X0,
                          xPositions[selectedStartIndex] -
                            (xPositions[1] - xPositions[0] || 16) / 2,
                        )}
                        y={Y1}
                        width={
                          Math.min(
                            X1,
                            xPositions[selectedEndIndex] +
                              (xPositions[1] - xPositions[0] || 16) / 2,
                          ) -
                          Math.max(
                            X0,
                            xPositions[selectedStartIndex] -
                              (xPositions[1] - xPositions[0] || 16) / 2,
                          )
                        }
                        height={Y0 - Y1}
                        className="pointer-events-none fill-blue-500/10 stroke-blue-500/60"
                        strokeWidth={1}
                      />
                    )}
                  <rect
                    x={X0}
                    y={Y1}
                    width={X1 - X0}
                    height={Y0 - Y1}
                    fill="transparent"
                    className="cursor-crosshair"
                    aria-label="Drag horizontally to filter tweets by year"
                    onPointerDown={beginRangeSelection}
                    onPointerMove={continueRangeSelection}
                    onPointerUp={finishRangeSelection}
                    onPointerCancel={() => setDragStartYear(null)}
                  />
                </svg>
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
                <span className={`mr-auto text-[11.5px] ${MUTED}`}>
                  Drag across the chart to filter the tweets by year.
                </span>
                <label className={`text-[11px] font-semibold ${MUTED}`}>
                  From
                  <select
                    aria-label="Tweets from year"
                    value={selectedYears?.start ?? ''}
                    onChange={(event) => {
                      if (!event.target.value) {
                        captureExplorerAction('year_filter_cleared', {
                          hasYearFilter: false,
                        })
                        setSelectedYears(null)
                        return
                      }
                      const start = Number(event.target.value)
                      captureExplorerAction('year_filter_applied', {
                        hasYearFilter: true,
                      })
                      setSelectedYears((current) => ({
                        start,
                        end: Math.max(start, current?.end ?? start),
                      }))
                    }}
                    className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                  >
                    <option value="">Any</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-[11px] font-semibold ${MUTED}`}>
                  To
                  <select
                    aria-label="Tweets through year"
                    value={selectedYears?.end ?? ''}
                    onChange={(event) => {
                      if (!event.target.value) {
                        captureExplorerAction('year_filter_cleared', {
                          hasYearFilter: false,
                        })
                        setSelectedYears(null)
                        return
                      }
                      const end = Number(event.target.value)
                      captureExplorerAction('year_filter_applied', {
                        hasYearFilter: true,
                      })
                      setSelectedYears((current) => ({
                        start: Math.min(current?.start ?? end, end),
                        end,
                      }))
                    }}
                    className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                  >
                    <option value="">Any</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedYears && (
                  <button
                    type="button"
                    onClick={() => {
                      captureExplorerAction('year_filter_cleared', {
                        hasYearFilter: false,
                      })
                      setSelectedYears(null)
                    }}
                    className={`rounded-[4px] px-2 py-1 text-[11px] font-semibold ${MUTED} hover:text-foreground`}
                  >
                    Clear range
                  </button>
                )}
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
                      <span
                        key={item.term}
                        className={`inline-flex items-center overflow-hidden rounded-full border text-[12px] font-semibold transition-colors ${
                          active
                            ? 'border-zinc-400 bg-zinc-50 text-foreground dark:border-[#45454c] dark:bg-[#202024]'
                            : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={`${active ? 'Hide' : 'Show'} ${item.term} series`}
                          onClick={() => {
                            captureExplorerAction('chart_series_toggled', {
                              enabledSeriesCount:
                                enabledSeries.length + (active ? -1 : 1),
                            })
                            setChartEnabled((current) => ({
                              ...current,
                              [item.term]: !current[item.term],
                            }))
                          }}
                          className="inline-flex items-center gap-1.5 py-1.5 pl-2.5 pr-1.5"
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
                        <button
                          type="button"
                          aria-label={`Remove ${item.term} trend`}
                          onClick={() => removeTerm(item.term)}
                          className="px-2 py-1.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                        >
                          ×
                        </button>
                      </span>
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
                  {selectedYears
                    ? `Posts from ${selectedYears.start}–${selectedYears.end} matching any included trend.`
                    : 'Latest posts matching any included trend.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  captureExplorerAction('evidence_refreshed')
                  setRequestedYears(selectedYears)
                  setRefreshKey((key) => key + 1)
                }}
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
                    <span
                      key={term}
                      className={`inline-flex items-center overflow-hidden rounded-full border text-[11.5px] font-bold transition-colors ${
                        filter === 'include'
                          ? 'border-brand bg-brand/10 text-blue-700 dark:text-blue-300'
                          : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={filterLabel(term, filter)}
                        onClick={() => {
                          captureExplorerAction('evidence_filter_toggled', {
                            includedSeriesCount:
                              includeTerms.length +
                              (filter === 'include' ? -1 : 1),
                          })
                          setFeedFilters((current) => ({
                            ...current,
                            [term]: nextFeedFilter(current[term] ?? 'off'),
                          }))
                        }}
                        className="py-1.5 pl-2.5 pr-1.5"
                      >
                        {filter === 'include' ? '+ ' : ''}
                        {term}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term} trend from explorer`}
                        onClick={() => removeTerm(term)}
                        className="px-2 py-1.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
              <div className={`mt-2.5 text-[10.5px] leading-normal ${MUTED}`}>
                Click a pill to include it or turn it off. Included terms are
                OR.
              </div>
            </div>

            <div
              className={`${CARD} max-h-[760px] overflow-y-auto`}
              aria-live="polite"
            >
              {isUpdatingEvidence && evidence.length === 0 && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Finding matching tweets…
                </div>
              )}
              {isUpdatingEvidence && evidence.length > 0 && (
                <div
                  className={`sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-2 text-[11.5px] backdrop-blur dark:border-[#29292e] dark:bg-[#171719]/95 ${MUTED}`}
                >
                  Updating this period in the background…
                </div>
              )}
              {includeTerms.length === 0 && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Include at least one term to inspect its tweets.
                </div>
              )}
              {feedError && (
                <div className="border-b border-red-200 px-4 py-3 text-center text-[12px] text-red-600 dark:border-red-900/60 dark:text-red-400">
                  {feedError}
                </div>
              )}
              {!isUpdatingEvidence &&
                !feedError &&
                includeTerms.length > 0 &&
                evidence.length === 0 && (
                  <div
                    className={`px-4 py-12 text-center text-[13px] ${MUTED}`}
                  >
                    No matching tweets in this period.
                  </div>
                )}
              {evidence.map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  collapsible
                  clickable
                  origin="trends"
                  returnTo="/trends"
                />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
