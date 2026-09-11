'use client'

import {
  presetGranularity,
  presetRange,
  type TimelinePreset,
} from '@/lib/portal/trendTimeline'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  clampTrendRange,
  parseTrendExplorerState,
  serializeTrendExplorerState,
  type TrendExplorerUrlState,
  type TrendRange,
} from '@/lib/portal/trendExplorerState'
import type {
  PortalTrends,
  TrendBucketSeries,
  TrendGranularity,
} from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'
import { requestDefaultKeywords, requestTrendSeries } from './requests'
import {
  annualSeries,
  snapshotBuckets,
  evidenceRange,
  convertedRange,
} from './model'
import {
  MAX_SERIES,
  SERIES_COLORS,
  isDefaultTrendSet,
  type TrendsExplorerAction,
} from './config'

type FeedFilter = 'include' | 'off'

export function useTrendExplorer({
  initialTrends,
  initialLoadFailed,
  initialSearch,
}: {
  initialTrends: PortalTrends
  initialLoadFailed: boolean
  initialSearch: string
}) {
  const [weekly, setWeekly] = useState(initialTrends.weekly)
  const defaultTerms = useMemo(
    () =>
      (weekly.length ? weekly : initialTrends.series)
        .map(({ term }) => term)
        .slice(0, MAX_SERIES),
    [weekly, initialTrends.series],
  )
  const initialUrlState = useRef(
    parseTrendExplorerState(initialSearch, defaultTerms),
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
  const [axis, setAxis] = useState<'linear' | 'log'>(
    initialUrlState.axis ?? 'linear',
  )
  const [timeline, setTimeline] = useState<TimelinePreset | undefined>(
    initialUrlState.timeline,
  )
  const [customChartRange, setCustomChartRange] = useState<TrendRange | null>(
    initialUrlState.chartRange ?? null,
  )
  const chartRange = timeline
    ? presetRange(timeline, buckets)
    : clampTrendRange(customChartRange, buckets)
  const setChartRange = (range: TrendRange | null) => {
    setTimeline(undefined)
    setCustomChartRange(range)
  }
  const [termInput, setTermInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isLoadingSeries, setIsLoadingSeries] = useState(
    initialUrlState.terms.length > 0 &&
      (initialUrlState.granularity !== 'year' ||
        initialUrlState.terms.some((term) => !initialAnnualByTerm.has(term))),
  )
  const [isRetryingDefaults, setIsRetryingDefaults] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [chartError, setChartError] = useState<string | null>(
    initialLoadFailed ? 'The default trends could not be loaded.' : null,
  )
  const [selectedRange, setSelectedRange] = useState<TrendRange | null>(
    initialSelectedRange,
  )
  const selectedEvidenceRange = useMemo(
    () => evidenceRange(selectedRange, granularity),
    [granularity, selectedRange],
  )
  const seriesRequestIdRef = useRef(0)
  const loadConfiguredSeries = useCallback(
    async (terms: string[], nextGranularity: TrendGranularity) => {
      if (!terms.length) {
        setSeries([])
        setIsLoadingSeries(false)
        return
      }
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
      axis,
      granularity,
      range: selectedRange,
      timeline,
      chartRange: customChartRange,
    }),
    [
      axis,
      chartEnabled,
      configuredTerms,
      granularity,
      includeTerms,
      scale,
      selectedRange,
      timeline,
      customChartRange,
    ],
  )
  const serializedState = useMemo(
    () => serializeTrendExplorerState(urlState),
    [urlState],
  )
  const returnTo = `/trends?${serializedState}`

  useEffect(() => {
    const needsSeriesRequest =
      granularity !== 'year' ||
      configuredTerms.some((term) => !initialAnnualByTerm.has(term))
    if (needsSeriesRequest && configuredTerms.length) {
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
    if (isLoadingSeries) return
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
      newTerms.length > 0 && isDefaultTrendSet(configuredTerms, defaultTerms)
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
      const nextWeekly = await requestDefaultKeywords()
      const terms = nextWeekly.map((row) => row.term).slice(0, MAX_SERIES)
      const body = terms.length
        ? await requestTrendSeries(terms, granularity)
        : { buckets: [], series: [] }
      setWeekly(nextWeekly)
      const defaults = body.series.map((item, index) => ({
        ...item,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }))
      setBuckets(body.buckets)
      setSeries(defaults)
      setConfiguredTerms(terms)
      setChartEnabled(
        Object.fromEntries(
          defaults.map(({ term }, index) => [term, index < 6]),
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
        enabledSeriesCount: Math.min(defaults.length, 6),
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
    captureExplorerAction('granularity_changed')
    const nextBuckets = snapshotBuckets(initialTrends, nextGranularity)
    setTimeline(undefined)
    setCustomChartRange((current) =>
      clampTrendRange(
        convertedRange(current, nextGranularity, granularity),
        nextBuckets,
      ),
    )
    setGranularity(nextGranularity)
    setSelectedRange((current) =>
      clampTrendRange(
        convertedRange(current, nextGranularity, granularity),
        nextBuckets,
      ),
    )
    setBuckets(nextBuckets)
    setSeries([])
    void loadConfiguredSeries(configuredTerms, nextGranularity)
  }

  const selectTimeline = (preset: TimelinePreset | 'all') => {
    selectGranularity(preset === 'all' ? 'month' : presetGranularity[preset])
    setCustomChartRange(null)
    setTimeline(preset === 'all' ? undefined : preset)
  }

  return {
    chartRange,
    setChartRange,
    timeline,
    selectTimeline,
    weekly,
    configuredTerms,
    granularity,
    buckets,
    series,
    chartEnabled,
    setChartEnabled,
    feedFilters,
    setFeedFilters,
    scale,
    setScale,
    axis,
    setAxis,
    termInput,
    setTermInput,
    isAdding,
    isLoadingSeries,
    isRetryingDefaults,
    addError,
    chartError,
    selectedRange,
    setSelectedRange,
    selectedEvidenceRange,
    enabledSeries,
    includeTerms,
    returnTo,
    captureExplorerAction,
    removeTerm,
    addTerms,
    retryDefaultTrends,
    selectGranularity,
  }
}
