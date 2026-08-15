'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  clampTrendRange,
  parseTrendExplorerState,
  serializeTrendExplorerState,
} from '@/lib/portal/trendExplorerState'
import type {
  TrendExplorerUrlState,
  TrendRange,
} from '@/lib/portal/trendExplorerState'
import type {
  PortalTrends,
  PortalTrendSeries,
  PortalTweet,
  TrendBucketSeries,
  TrendGranularity,
} from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'
import { BODY, CARD, MUTED, SERIF } from './styles'

type FeedFilter = 'include' | 'off'

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

function isDefaultTrendSet(terms: string[]): boolean {
  return (
    terms.length === DEFAULT_TREND_TERMS.length &&
    terms.every((term, index) => term === DEFAULT_TREND_TERMS[index])
  )
}

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

async function requestTrendSeries(
  terms: string[],
  granularity: TrendGranularity,
): Promise<PortalTrendSeries> {
  const params = new URLSearchParams({ view: 'series', granularity })
  terms.forEach((term) => params.append('q', term))
  const response = await fetch(`/api/portal/trends?${params.toString()}`)
  const body = (await response.json().catch(() => null)) as
    | (PortalTrendSeries & { error?: string })
    | null
  if (!response.ok) {
    throw new Error(body?.error || 'Could not load those trends')
  }
  if (
    !body ||
    body.granularity !== granularity ||
    !Array.isArray(body.buckets) ||
    !Array.isArray(body.series)
  ) {
    throw new Error('The trends service returned an invalid response')
  }
  return body
}

async function requestTrendEvidence(
  term: string,
  range: TrendEvidenceRange | null,
  signal: AbortSignal,
): Promise<PortalTweet[]> {
  const params = new URLSearchParams({ view: 'feed', include: term })
  if (range) {
    params.set('since', range.since)
    params.set('until', range.until)
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

function sameEvidenceRange(
  left: TrendEvidenceRange | null,
  right: TrendEvidenceRange | null,
): boolean {
  return left?.since === right?.since && left?.until === right?.until
}

function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
}

function evidenceRange(
  range: TrendRange | null,
  granularity: TrendGranularity,
): TrendEvidenceRange | null {
  if (!range) return null
  if (granularity === 'month') {
    return { since: `${range.start}-01`, until: nextMonthStart(range.end) }
  }
  return {
    since: `${range.start}-01-01`,
    until: `${Number(range.end) + 1}-01-01`,
  }
}

function convertedRange(
  range: TrendRange | null,
  granularity: TrendGranularity,
): TrendRange | null {
  if (!range) return null
  return granularity === 'month'
    ? {
        start: `${range.start.slice(0, 4)}-01`,
        end: `${range.end.slice(0, 4)}-12`,
      }
    : { start: range.start.slice(0, 4), end: range.end.slice(0, 4) }
}

function annualSeries(initialTrends: PortalTrends): TrendBucketSeries[] {
  return initialTrends.series.map((item) => ({
    term: item.term,
    color: item.color,
    tweetsPerBucket: item.tweetsPerYear,
    perBucket: item.perYear,
  }))
}

function snapshotBuckets(
  initialTrends: PortalTrends,
  granularity: TrendGranularity,
): string[] {
  if (granularity === 'year') return initialTrends.years.map(String)
  const firstYear = initialTrends.years[0]
  const lastYear = initialTrends.years.at(-1)
  if (firstYear === undefined || lastYear === undefined) return []
  const computedAt = new Date(initialTrends.computedAt)
  const lastMonth =
    !Number.isNaN(computedAt.getTime()) &&
    computedAt.getUTCFullYear() === lastYear
      ? computedAt.getUTCMonth() + 1
      : 12
  const count = (lastYear - firstYear) * 12 + lastMonth
  return Array.from({ length: count }, (_, index) => {
    const year = firstYear + Math.floor(index / 12)
    const month = (index % 12) + 1
    return `${year}-${String(month).padStart(2, '0')}`
  })
}

function bucketLabel(bucket: string, granularity: TrendGranularity): string {
  if (granularity === 'year') return bucket
  const [year, month] = bucket.split('-').map(Number)
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
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
  initialSearch = '',
}: {
  initialTrends: PortalTrends
  initialLoadFailed?: boolean
  initialSearch?: string
}) {
  const initialUrlState = useRef(
    parseTrendExplorerState(
      initialSearch,
      initialTrends.series.map(({ term }) => term),
    ),
  ).current
  const initialAnnualSeries = useRef(annualSeries(initialTrends)).current
  const initialAnnualByTerm = useMemo(
    () => new Map(initialAnnualSeries.map((item) => [item.term, item])),
    [initialAnnualSeries],
  )
  const initialBuckets = useRef(
    snapshotBuckets(initialTrends, initialUrlState.granularity),
  ).current
  const initialSelectedRange = useRef(
    clampTrendRange(initialUrlState.range, initialBuckets),
  ).current
  const [configuredTerms, setConfiguredTerms] = useState(initialUrlState.terms)
  const [granularity, setGranularity] = useState(initialUrlState.granularity)
  const [buckets, setBuckets] = useState<string[]>(initialBuckets)
  const [series, setSeries] = useState<TrendBucketSeries[]>(() =>
    initialUrlState.granularity === 'year'
      ? initialUrlState.terms.flatMap((term) => {
          const item = initialAnnualByTerm.get(term)
          return item ? [item] : []
        })
      : [],
  )
  const [chartEnabled, setChartEnabled] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        initialUrlState.terms.map((term) => [
          term,
          initialUrlState.shown.includes(term),
        ]),
      ),
  )
  const [feedFilters, setFeedFilters] = useState<Record<string, FeedFilter>>(
    () =>
      Object.fromEntries(
        initialUrlState.terms.map((term) => [
          term,
          initialUrlState.included.includes(term) ? 'include' : 'off',
        ]),
      ),
  )
  const [scale, setScale] = useState(initialUrlState.scale)
  const [termInput, setTermInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isLoadingSeries, setIsLoadingSeries] = useState(
    initialUrlState.granularity === 'month' ||
      initialUrlState.terms.some((term) => !initialAnnualByTerm.has(term)),
  )
  const [isRetryingDefaults, setIsRetryingDefaults] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [chartError, setChartError] = useState<string | null>(
    initialLoadFailed ? 'The default trends could not be loaded.' : null,
  )
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedRange, setSelectedRange] = useState<TrendRange | null>(
    initialSelectedRange,
  )
  const selectedEvidenceRange = useMemo(
    () => evidenceRange(selectedRange, granularity),
    [granularity, selectedRange],
  )
  const [requestedRange, setRequestedRange] =
    useState<TrendEvidenceRange | null>(selectedEvidenceRange)
  const [, setEvidenceCacheVersion] = useState(0)
  const [dragStartBucket, setDragStartBucket] = useState<string | null>(null)
  const chartRef = useRef<SVGSVGElement>(null)
  const seriesRequestIdRef = useRef(0)
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

  const loadConfiguredSeries = useCallback(
    async (terms: string[], nextGranularity: TrendGranularity) => {
      const requestId = ++seriesRequestIdRef.current
      setIsLoadingSeries(true)
      setChartError(null)
      try {
        const body = await requestTrendSeries(terms, nextGranularity)
        if (seriesRequestIdRef.current !== requestId) return
        setBuckets(body.buckets)
        setSeries(body.series)
        setSelectedRange((current) => clampTrendRange(current, body.buckets))
      } catch (error) {
        if (seriesRequestIdRef.current !== requestId) return
        setChartError(
          error instanceof Error
            ? error.message
            : 'The trend series could not be loaded.',
        )
      } finally {
        if (seriesRequestIdRef.current === requestId) {
          setIsLoadingSeries(false)
        }
      }
    },
    [],
  )

  const enabledSeries = useMemo(
    () => series.filter(({ term }) => chartEnabled[term]),
    [chartEnabled, series],
  )
  const includeTerms = useMemo(
    () => configuredTerms.filter((term) => feedFilters[term] === 'include'),
    [configuredTerms, feedFilters],
  )
  const evidence = cachedTrendEvidence(
    evidenceCacheRef.current,
    includeTerms,
    selectedEvidenceRange,
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
      has_year_filter: overrides.hasYearFilter ?? selectedRange !== null,
    })
  }

  const urlState = useMemo<TrendExplorerUrlState>(
    () => ({
      terms: configuredTerms,
      shown: configuredTerms.filter((term) => chartEnabled[term]),
      included: includeTerms,
      scale,
      granularity,
      range: selectedRange,
    }),
    [
      chartEnabled,
      configuredTerms,
      granularity,
      includeTerms,
      scale,
      selectedRange,
    ],
  )
  const serializedState = useMemo(
    () => serializeTrendExplorerState(urlState),
    [urlState],
  )
  const returnTo = `/trends?${serializedState}`

  useEffect(() => {
    const needsSeriesRequest =
      granularity === 'month' ||
      configuredTerms.some((term) => !initialAnnualByTerm.has(term))
    if (needsSeriesRequest) {
      void loadConfiguredSeries(configuredTerms, granularity)
    }
    // Only hydrate series missing from the server snapshot on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const nextUrl = `/trends?${serializedState}`
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl !== nextUrl) {
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [serializedState])

  useEffect(() => {
    const requests = evidenceRequestsRef.current
    return () => {
      requests.forEach(({ controller }) => controller.abort())
      requests.clear()
    }
  }, [])

  useEffect(() => {
    if (
      dragStartBucket !== null ||
      sameEvidenceRange(selectedEvidenceRange, requestedRange)
    ) {
      return
    }
    setFeedError(null)
    const timeout = window.setTimeout(
      () => setRequestedRange(selectedEvidenceRange),
      RANGE_QUERY_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [dragStartBucket, requestedRange, selectedEvidenceRange])

  useEffect(() => {
    const signature = JSON.stringify({
      includeTerms,
      requestedRange,
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
          requestedRange,
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
        const key = trendEvidenceCacheKey(term, requestedRange)
        let request = evidenceRequestsRef.current.get(key)
        if (!request) {
          const controller = new AbortController()
          let promise: Promise<PortalTweet[]>
          promise = requestTrendEvidence(
            term,
            requestedRange,
            controller.signal,
          )
            .then((tweets) => {
              storeTrendEvidence(evidenceCacheRef.current, {
                term,
                range: requestedRange,
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
            trendEvidenceCacheKey(term, requestedRange),
          ),
        ),
      )
    }

    void loadEvidence()
  }, [includeTerms, refreshKey, requestedRange])

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
    setConfiguredTerms((current) => current.filter((item) => item !== term))
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

    const existing = new Set(configuredTerms)
    const alreadyPresent = requested.filter((term) => existing.has(term))
    const newTerms = requested.filter((term) => !existing.has(term))
    const replaceDefaults =
      newTerms.length > 0 && isDefaultTrendSet(configuredTerms)
    const nextConfiguredTerms = replaceDefaults
      ? [...alreadyPresent, ...newTerms]
      : [...configuredTerms, ...newTerms]
    if (nextConfiguredTerms.length > MAX_SERIES) {
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
      const body = await requestTrendSeries(newTerms, granularity)

      const retainedSeries = replaceDefaults
        ? series.filter(({ term }) => alreadyPresent.includes(term))
        : series
      const firstColorIndex = retainedSeries.length
      const additions = body.series.map((item, index) => ({
        ...item,
        color: SERIES_COLORS[(firstColorIndex + index) % SERIES_COLORS.length],
      }))
      const nextSeries = [...retainedSeries, ...additions]
      setBuckets(body.buckets)
      setSeries(nextSeries)
      setConfiguredTerms(nextConfiguredTerms)
      setChartEnabled((current) =>
        replaceDefaults
          ? Object.fromEntries(nextConfiguredTerms.map((term) => [term, true]))
          : {
              ...current,
              ...Object.fromEntries(additions.map(({ term }) => [term, true])),
            },
      )
      setFeedFilters((current) =>
        replaceDefaults
          ? Object.fromEntries(
              nextConfiguredTerms.map((term) => [term, 'include' as const]),
            )
          : {
              ...current,
              ...Object.fromEntries(
                additions.map(({ term }) => [term, 'include' as const]),
              ),
            },
      )
      const nextEnabled = replaceDefaults
        ? new Set(nextConfiguredTerms)
        : new Set([
            ...enabledSeries.map(({ term }) => term),
            ...alreadyPresent,
            ...additions.map(({ term }) => term),
          ])
      const nextIncluded = replaceDefaults
        ? new Set(nextConfiguredTerms)
        : new Set([...includeTerms, ...additions.map(({ term }) => term)])
      captureExplorerAction('terms_added', {
        seriesCount: nextSeries.length,
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
      const body = await requestTrendSeries(DEFAULT_TREND_TERMS, granularity)
      const defaultColors = new Map(
        CHART_TERMS.map(({ term, color }) => [term, color]),
      )
      const defaults = body.series.map((item) => ({
        ...item,
        color: defaultColors.get(item.term) ?? item.color,
      }))
      setBuckets(body.buckets)
      setSeries(defaults)
      setConfiguredTerms(DEFAULT_TREND_TERMS)
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

  const selectGranularity = (nextGranularity: TrendGranularity) => {
    if (nextGranularity === granularity) return
    const nextBuckets = snapshotBuckets(initialTrends, nextGranularity)
    setGranularity(nextGranularity)
    setSelectedRange((current) =>
      clampTrendRange(convertedRange(current, nextGranularity), nextBuckets),
    )
    setBuckets(nextBuckets)
    setSeries([])
    void loadConfiguredSeries(configuredTerms, nextGranularity)
  }

  const valuesFor = (item: TrendBucketSeries) =>
    scale === 'normalized' ? item.perBucket : item.tweetsPerBucket
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
  const xPositions = buckets.map(
    (_, index) => X0 + (index * (X1 - X0)) / Math.max(buckets.length - 1, 1),
  )
  const axisTickIndexes = buckets
    .map((_, index) => index)
    .filter(
      (index) =>
        granularity === 'year' ||
        index === 0 ||
        index === buckets.length - 1 ||
        index % 12 === 0,
    )
  const yPosition = (value: number) => Y0 - (value / chartMax) * (Y0 - Y1)
  const selectedStartIndex = selectedRange
    ? buckets.indexOf(selectedRange.start)
    : -1
  const selectedEndIndex = selectedRange
    ? buckets.indexOf(selectedRange.end)
    : -1
  const isUpdatingEvidence =
    includeTerms.length > 0 &&
    (isLoadingEvidence ||
      (!sameEvidenceRange(selectedEvidenceRange, requestedRange) &&
        includeTerms.some(
          (term) =>
            !hasCompleteTrendEvidence(
              evidenceCacheRef.current,
              term,
              selectedEvidenceRange,
              EVIDENCE_PAGE_SIZE,
            ),
        )))

  const bucketForPointer = (clientX: number): string | null => {
    const svg = chartRef.current
    if (!svg || buckets.length === 0) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const svgX = ((clientX - rect.left) / rect.width) * W
    const ratio = Math.max(0, Math.min(1, (svgX - X0) / (X1 - X0)))
    const index = Math.round(ratio * Math.max(buckets.length - 1, 0))
    return buckets[index] ?? null
  }

  const updateDraggedRange = (bucket: string, anchor = dragStartBucket) => {
    if (anchor === null) return
    setSelectedRange({
      start: anchor < bucket ? anchor : bucket,
      end: anchor > bucket ? anchor : bucket,
    })
  }

  const beginRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    const bucket = bucketForPointer(event.clientX)
    if (bucket === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragStartBucket(bucket)
  }

  const continueRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartBucket === null) return
    const bucket = bucketForPointer(event.clientX)
    if (bucket !== null && bucket !== dragStartBucket) {
      updateDraggedRange(bucket)
    }
  }

  const finishRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartBucket === null) return
    const bucket = bucketForPointer(event.clientX)
    if (bucket !== null && bucket !== dragStartBucket) {
      updateDraggedRange(bucket)
      captureExplorerAction('year_filter_applied', { hasYearFilter: true })
    }
    setDragStartBucket(null)
  }

  return (
    <main className="flex-1 bg-zinc-100/80 dark:bg-transparent">
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
            Full corpus · {initialTrends.years[0]}–{initialTrends.years.at(-1)}
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
                  {configuredTerms.length}/{MAX_SERIES} trends
                </span>
              </div>
            </div>

            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3.5 dark:border-[#26262a] sm:px-5">
                <div>
                  <h2 className="text-[14px] font-bold">
                    {scale === 'normalized'
                      ? 'Frequency per 100k tweets'
                      : `Matching tweets by ${granularity}`}
                  </h2>
                  <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                    {scale === 'normalized'
                      ? `Adjusted for the archive’s changing ${granularity === 'year' ? 'annual' : 'monthly'} volume.`
                      : `Raw matching tweet count in each calendar ${granularity}.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div
                    className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
                    aria-label="Trend granularity"
                  >
                    {(['year', 'month'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={granularity === option}
                        onClick={() => selectGranularity(option)}
                        disabled={isLoadingSeries}
                        className={`rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                          granularity === option
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : `${MUTED} hover:text-foreground`
                        }`}
                      >
                        {option === 'year' ? 'Years' : 'Months'}
                      </button>
                    ))}
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
                  aria-label={`${granularity === 'year' ? 'Yearly' : 'Monthly'} term trends shown as ${scale === 'normalized' ? 'occurrences per 100,000 tweets' : 'raw tweet counts'}`}
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
                  {axisTickIndexes.map((index) => (
                    <text
                      key={buckets[index]}
                      x={xPositions[index]}
                      y={350}
                      textAnchor="middle"
                      fontSize={11}
                      className="fill-zinc-400 dark:fill-[#6d6d78]"
                    >
                      {bucketLabel(buckets[index], granularity)}
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
                            key={buckets[index]}
                            cx={xPositions[index]}
                            cy={yPosition(value)}
                            r={3}
                            fill={item.color}
                            className="stroke-white dark:stroke-[#1b1b1e]"
                            strokeWidth={1.5}
                            aria-label={`${item.term} · ${bucketLabel(buckets[index], granularity)} · ${
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
                      {isLoadingSeries
                        ? `Loading ${granularity === 'month' ? 'monthly' : 'yearly'} trends…`
                        : series.length === 0
                          ? 'Add a trend above to start charting.'
                          : 'Select a trend below to draw it.'}
                    </text>
                  )}
                  {selectedRange &&
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
                    aria-label={`Drag horizontally to filter tweets by ${granularity}`}
                    onPointerDown={beginRangeSelection}
                    onPointerMove={continueRangeSelection}
                    onPointerUp={finishRangeSelection}
                    onPointerCancel={() => setDragStartBucket(null)}
                  />
                </svg>
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
                <span className={`mr-auto text-[11.5px] ${MUTED}`}>
                  Drag across the chart to filter tweets by {granularity}.
                  Clicking alone keeps the current range.
                </span>
                {granularity === 'year' ? (
                  <>
                    <label className={`text-[11px] font-semibold ${MUTED}`}>
                      From
                      <select
                        aria-label="Tweets from year"
                        value={selectedRange?.start ?? ''}
                        onChange={(event) => {
                          if (!event.target.value) {
                            captureExplorerAction('year_filter_cleared', {
                              hasYearFilter: false,
                            })
                            setSelectedRange(null)
                            return
                          }
                          const start = event.target.value
                          captureExplorerAction('year_filter_applied', {
                            hasYearFilter: true,
                          })
                          setSelectedRange((current) => ({
                            start,
                            end:
                              current && current.end >= start
                                ? current.end
                                : start,
                          }))
                        }}
                        className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                      >
                        <option value="">Any</option>
                        {buckets.map((bucket) => (
                          <option key={bucket} value={bucket}>
                            {bucket}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`text-[11px] font-semibold ${MUTED}`}>
                      To
                      <select
                        aria-label="Tweets through year"
                        value={selectedRange?.end ?? ''}
                        onChange={(event) => {
                          if (!event.target.value) {
                            captureExplorerAction('year_filter_cleared', {
                              hasYearFilter: false,
                            })
                            setSelectedRange(null)
                            return
                          }
                          const end = event.target.value
                          captureExplorerAction('year_filter_applied', {
                            hasYearFilter: true,
                          })
                          setSelectedRange((current) => ({
                            start:
                              current && current.start <= end
                                ? current.start
                                : end,
                            end,
                          }))
                        }}
                        className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                      >
                        <option value="">Any</option>
                        {buckets.map((bucket) => (
                          <option key={bucket} value={bucket}>
                            {bucket}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className={`text-[11px] font-semibold ${MUTED}`}>
                      From
                      <input
                        type="month"
                        aria-label="Tweets from month"
                        min={buckets[0]}
                        max={buckets.at(-1)}
                        value={selectedRange?.start ?? ''}
                        onChange={(event) => {
                          const start = event.target.value
                          if (!start) {
                            captureExplorerAction('year_filter_cleared', {
                              hasYearFilter: false,
                            })
                            setSelectedRange(null)
                            return
                          }
                          captureExplorerAction('year_filter_applied', {
                            hasYearFilter: true,
                          })
                          setSelectedRange((current) => ({
                            start,
                            end:
                              current && current.end >= start
                                ? current.end
                                : start,
                          }))
                        }}
                        className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                      />
                    </label>
                    <label className={`text-[11px] font-semibold ${MUTED}`}>
                      To
                      <input
                        type="month"
                        aria-label="Tweets through month"
                        min={buckets[0]}
                        max={buckets.at(-1)}
                        value={selectedRange?.end ?? ''}
                        onChange={(event) => {
                          const end = event.target.value
                          if (!end) {
                            captureExplorerAction('year_filter_cleared', {
                              hasYearFilter: false,
                            })
                            setSelectedRange(null)
                            return
                          }
                          captureExplorerAction('year_filter_applied', {
                            hasYearFilter: true,
                          })
                          setSelectedRange((current) => ({
                            start:
                              current && current.start <= end
                                ? current.start
                                : end,
                            end,
                          }))
                        }}
                        className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
                      />
                    </label>
                  </>
                )}
                {selectedRange && (
                  <button
                    type="button"
                    onClick={() => {
                      captureExplorerAction('year_filter_cleared', {
                        hasYearFilter: false,
                      })
                      setSelectedRange(null)
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
                  {configuredTerms.map((term, index) => {
                    const item = series.find((entry) => entry.term === term)
                    const active = !!chartEnabled[term]
                    const color =
                      item?.color ?? SERIES_COLORS[index % SERIES_COLORS.length]
                    return (
                      <span
                        key={term}
                        className={`inline-flex items-center overflow-hidden rounded-full border text-[12px] font-semibold transition-colors ${
                          active
                            ? 'border-zinc-400 bg-zinc-50 text-foreground dark:border-[#45454c] dark:bg-[#202024]'
                            : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={`${active ? 'Hide' : 'Show'} ${term} series`}
                          onClick={() => {
                            captureExplorerAction('chart_series_toggled', {
                              enabledSeriesCount:
                                enabledSeries.length + (active ? -1 : 1),
                            })
                            setChartEnabled((current) => ({
                              ...current,
                              [term]: !current[term],
                            }))
                          }}
                          className="inline-flex items-center gap-1.5 py-1.5 pl-2.5 pr-1.5"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: color,
                              opacity: active ? 1 : 0.3,
                            }}
                          />
                          {term}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${term} trend`}
                          onClick={() => removeTerm(term)}
                          className="px-2 py-1.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                  {configuredTerms.length === 0 && (
                    <span className={`py-1 text-[12px] ${MUTED}`}>
                      No trend series loaded.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className={`mt-3 text-[12px] leading-relaxed ${BODY}`}>
              Normalization divides each term’s {granularity} count by all
              archived tweets from that {granularity}, then scales the result to
              100,000. This makes periods with different archive coverage
              comparable.
            </p>
          </section>

          <aside className="min-w-0 lg:sticky lg:top-20">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold" style={SERIF}>
                  Tweets counted
                </h2>
                <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                  {selectedRange
                    ? `Posts from ${bucketLabel(selectedRange.start, granularity)}–${bucketLabel(selectedRange.end, granularity)} matching any included trend.`
                    : 'Latest posts matching any included trend.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  captureExplorerAction('evidence_refreshed')
                  setRequestedRange(selectedEvidenceRange)
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
                {configuredTerms.map((term) => {
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
                  returnTo={returnTo}
                />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
