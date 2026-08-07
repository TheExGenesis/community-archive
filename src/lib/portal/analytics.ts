import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import type { PortalTrends, TermSeries, TermWeek } from './types'

export const FIRST_TREND_YEAR = 2019

/** Terms plotted in the trends explorer chart. */
export const CHART_TERMS: { term: string; color: string }[] = [
  { term: 'tpot', color: '#3b82f6' },
  { term: 'postrat', color: '#f59e0b' },
  { term: 'egregore', color: '#a78bfa' },
  { term: 'moloch', color: '#f87171' },
  { term: 'vibecamp', color: '#2acf80' },
  { term: 'sensemaking', color: '#38bdf8' },
  { term: 'ai agents', color: '#e879f9' },
]

/** Wider watchlist used for the weekly rising/cooling panels. */
export const WATCHLIST = [
  'ai agents',
  'claude',
  'jhana',
  'egregore',
  'tpot',
  'vibecamp',
  'sensemaking',
  'moloch',
  'meditation',
  'alignment',
  'psyop',
  'wordcel',
]

type AnalyticsFetcher = typeof fetchAnalyticsGatewayJson

interface ClickHouseSummaryResponse {
  data: {
    totalTweets: string | number
    sourceUpdatedAt: string
    collectedAt: string
  }
}

interface ClickHouseStreamStatsResponse {
  summary: {
    totalTweets: string | number
    latestObservedAt: string | null
    scope: 'firehose' | 'all'
    countMode: 'unique_tweets_observed'
  }
}

interface ClickHouseTrendRow {
  bucket: string
  tweets: string | number
  totalTweets: string | number
  ratePerThousand: number
}

interface ClickHouseTrendResponse {
  data: ClickHouseTrendRow[]
}

export interface PortalLiveAnalytics {
  totalTweets: number
  streamedToday: number
  generatedAt: string
  latestObservedAt: string | null
}

function safeCount(value: string | number, field: string): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`ClickHouse portal data returned an invalid ${field}`)
  }
  return count
}

function safeTimestamp(value: string, field: string): string {
  const timestamp = new Date(normalizeClickHouseTimestamp(value))
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`ClickHouse portal data returned an invalid ${field}`)
  }
  return timestamp.toISOString()
}

function normalizeClickHouseTimestamp(value: string): string {
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return value
  return `${value.replace(' ', 'T')}Z`
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000)
}

function utcDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function runBatched<T>(
  jobs: Array<() => Promise<T>>,
  concurrency = 6,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const index = next++
        results[index] = await jobs[index]()
      }
    },
  )
  await Promise.all(workers)
  return results
}

function trendParams(
  term: string,
  bucket: 'day' | 'year',
  from: string,
  to: string,
): URLSearchParams {
  return new URLSearchParams({
    q: term,
    bucket,
    match: 'all',
    from,
    to,
  })
}

async function fetchTrend(
  term: string,
  bucket: 'day' | 'year',
  from: string,
  to: string,
  fetcher: AnalyticsFetcher,
): Promise<ClickHouseTrendResponse> {
  const response = await fetcher<ClickHouseTrendResponse>(
    ['word-trend'],
    trendParams(term, bucket, from, to),
    { timeoutMs: 30_000 },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('ClickHouse word-trend returned an invalid response')
  }
  return response
}

function ratePerHundredThousand(row: ClickHouseTrendRow): number {
  const tweets = safeCount(row.tweets, 'trend tweet count')
  const totalTweets = safeCount(row.totalTweets, 'trend corpus count')
  return totalTweets === 0 ? 0 : (tweets / totalTweets) * 100_000
}

export async function fetchPortalLiveAnalytics(
  now = new Date(),
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalLiveAnalytics> {
  const start = startOfUtcDay(now)
  const streamParams = new URLSearchParams({
    start: start.toISOString(),
    end: now.toISOString(),
    granularity: 'hour',
    scope: 'firehose',
  })

  const [summary, stream] = await Promise.all([
    fetcher<ClickHouseSummaryResponse>(['summary'], new URLSearchParams(), {
      timeoutMs: 25_000,
    }),
    fetcher<ClickHouseStreamStatsResponse>(['stream-stats'], streamParams, {
      timeoutMs: 25_000,
    }),
  ])

  if (
    stream.summary?.scope !== 'firehose' ||
    stream.summary?.countMode !== 'unique_tweets_observed'
  ) {
    throw new Error('ClickHouse stream-stats returned an invalid response')
  }

  return {
    totalTweets: safeCount(summary.data.totalTweets, 'tweet count'),
    streamedToday: safeCount(
      stream.summary.totalTweets,
      'streamed-today count',
    ),
    generatedAt: safeTimestamp(summary.data.collectedAt, 'snapshot timestamp'),
    latestObservedAt: stream.summary.latestObservedAt
      ? safeTimestamp(stream.summary.latestObservedAt, 'observation timestamp')
      : null,
  }
}

export async function fetchPortalTrends(
  now = new Date(),
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalTrends> {
  const currentYear = now.getUTCFullYear()
  const years = Array.from(
    { length: currentYear - FIRST_TREND_YEAR + 1 },
    (_, index) => FIRST_TREND_YEAR + index,
  )
  // word-trend accepts date inputs (the same YYYY-MM-DD values used by the
  // ClickHouse lab UI), rather than full ISO timestamps.
  const yearlyFrom = `${FIRST_TREND_YEAR}-01-01`
  const yearlyTo = `${currentYear + 1}-01-01`
  const today = startOfUtcDay(now)
  const from14 = daysBefore(today, 13)
  const from7 = daysBefore(today, 6)
  const weeklyTo = daysBefore(today, -1)

  const jobs: Array<() => Promise<ClickHouseTrendResponse>> = [
    ...CHART_TERMS.map(
      ({ term }) =>
        () =>
          fetchTrend(term, 'year', yearlyFrom, yearlyTo, fetcher),
    ),
    ...WATCHLIST.map(
      (term) => () =>
        fetchTrend(
          term,
          'day',
          utcDateParam(from14),
          utcDateParam(weeklyTo),
          fetcher,
        ),
    ),
  ]
  const responses = await runBatched(jobs)
  const yearlyResponses = responses.slice(0, CHART_TERMS.length)
  const weeklyResponses = responses.slice(CHART_TERMS.length)

  const series: TermSeries[] = CHART_TERMS.map(({ term, color }, index) => {
    const values = new Map<number, number>()
    for (const row of yearlyResponses[index].data) {
      const bucket = new Date(normalizeClickHouseTimestamp(row.bucket))
      if (Number.isNaN(bucket.getTime())) {
        throw new Error('ClickHouse word-trend returned an invalid bucket')
      }
      values.set(bucket.getUTCFullYear(), ratePerHundredThousand(row))
    }
    return {
      term,
      color,
      perYear: years.map((year) => values.get(year) ?? 0),
    }
  })

  const weekly: TermWeek[] = WATCHLIST.map((term, index) => {
    let last7 = 0
    let prev7 = 0
    for (const row of weeklyResponses[index].data) {
      const bucket = new Date(normalizeClickHouseTimestamp(row.bucket))
      if (Number.isNaN(bucket.getTime())) {
        throw new Error('ClickHouse word-trend returned an invalid bucket')
      }
      const count = safeCount(row.tweets, 'weekly trend count')
      if (bucket >= from7) last7 += count
      else if (bucket >= from14) prev7 += count
    }
    return {
      term,
      last7,
      prev7,
      deltaPct: prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null,
      status: prev7 > 0 ? 'comparable' : last7 > 0 ? 'new' : 'inactive',
    }
  })

  return {
    years,
    series,
    weekly,
    computedAt: now.toISOString(),
  }
}
