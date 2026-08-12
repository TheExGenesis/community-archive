import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { CHART_TERMS, FIRST_TREND_YEAR, TREND_COLORS } from './trendConfig'
import type {
  PortalBangersPage,
  PortalBangersScope,
  PortalBangersSort,
  PortalTrends,
  PortalTrendSeries,
  PortalTweet,
  TermSeries,
  TrendGranularity,
  TermWeek,
} from './types'

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
// Keep corpus-scan fan-out aligned with the two-query production capacity.
const DEFAULT_ANALYTICS_CONCURRENCY = 2

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

interface ClickHouseSearchTweet {
  tweetId: string
  accountId: string
  createdAt: string
  fullText: string
  favoriteCount: string | number
  retweetCount: string | number
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
}

interface ClickHouseSearchResponse {
  data: {
    tweets: ClickHouseSearchTweet[]
    nextOffset: number | null
  }
}

interface ClickHouseRecentBanger {
  tweetId: string
  accountId: string
  createdAt: string
  fullText: string
  favoriteCount: string | number
  retweetCount: string | number
  latestObservedAt: string
  quoteCount: string | number
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
}

interface ClickHouseRecentBangersResponse {
  data: ClickHouseRecentBanger[]
}

interface ClickHouseTopQuote {
  tweetId: string
  quoteCount: string | number
  accountId: string | null
  username: string | null
  displayName: string | null
  createdAt: string | null
  fullText: string | null
  favoriteCount: string | number
  retweetCount: string | number
  avatarMediaUrl: string | null
}

interface ClickHouseTopQuotesResponse {
  data: ClickHouseTopQuote[]
  pagination?: {
    limit: number
    offset: number
    nextOffset: number | null
    totalAvailable: number
    snapshotSize: number
    yearCounts: Array<{ year: number; count: number }>
    candidateRankingTruncated: boolean
  }
}

export interface PortalLiveAnalytics {
  totalTweets: number
  streamedLast24Hours: number
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
  concurrency = DEFAULT_ANALYTICS_CONCURRENCY,
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
  bucket: 'day' | TrendGranularity,
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
  bucket: 'day' | TrendGranularity,
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

/** Matches the gateway's word normalization for word-trend and search. */
export function portalTrendTokens(value: string): string[] {
  return normalizedTextTokens(value).slice(0, 4)
}

function normalizedTextTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}_]+/u)
        .filter((token) => token.length > 0 && token.length <= 48),
    ),
  )
}

function stableTrendColor(term: string): string {
  let hash = 0
  for (const character of term) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  }
  return TREND_COLORS[hash % TREND_COLORS.length]
}

function trendBuckets(
  granularity: TrendGranularity,
  now: Date,
): { buckets: string[]; from: string; to: string } {
  const currentYear = now.getUTCFullYear()
  if (granularity === 'year') {
    return {
      buckets: Array.from(
        { length: currentYear - FIRST_TREND_YEAR + 1 },
        (_, index) => String(FIRST_TREND_YEAR + index),
      ),
      from: `${FIRST_TREND_YEAR}-01-01`,
      to: `${currentYear + 1}-01-01`,
    }
  }

  const currentMonth = now.getUTCMonth()
  const count = (currentYear - FIRST_TREND_YEAR) * 12 + currentMonth + 1
  return {
    buckets: Array.from({ length: count }, (_, index) => {
      const year = FIRST_TREND_YEAR + Math.floor(index / 12)
      const month = (index % 12) + 1
      return `${year}-${String(month).padStart(2, '0')}`
    }),
    from: `${FIRST_TREND_YEAR}-01-01`,
    to: new Date(Date.UTC(currentYear, currentMonth + 1, 1))
      .toISOString()
      .slice(0, 10),
  }
}

function trendBucketKey(bucket: string, granularity: TrendGranularity): string {
  const date = new Date(normalizeClickHouseTimestamp(bucket))
  if (Number.isNaN(date.getTime())) {
    throw new Error('ClickHouse word-trend returned an invalid bucket')
  }
  const year = String(date.getUTCFullYear())
  return granularity === 'year'
    ? year
    : `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Fetch one or more user-selected series with a bounded corpus range. */
export async function fetchPortalTrendSeries(
  terms: string[],
  now = new Date(),
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
  granularity: TrendGranularity = 'year',
): Promise<PortalTrendSeries> {
  const { buckets, from, to } = trendBuckets(granularity, now)
  const responses = await runBatched(
    terms.map((term) => () => fetchTrend(term, granularity, from, to, fetcher)),
  )

  const series = terms.map((term, index) => {
    const rows = new Map<string, ClickHouseTrendRow>()
    for (const row of responses[index].data) {
      rows.set(trendBucketKey(row.bucket, granularity), row)
    }
    return {
      term,
      color: stableTrendColor(term),
      tweetsPerBucket: buckets.map((bucket) => {
        const row = rows.get(bucket)
        return row ? safeCount(row.tweets, 'trend tweet count') : 0
      }),
      perBucket: buckets.map((bucket) => {
        const row = rows.get(bucket)
        return row ? ratePerHundredThousand(row) : 0
      }),
    }
  })

  return { granularity, buckets, series, computedAt: now.toISOString() }
}

interface PortalTrendEvidenceOptions {
  limit?: number
  since?: string
  until?: string
}

/** Latest posts counted by at least one included trend in an optional period. */
export async function fetchPortalTrendEvidence(
  includeTerms: string[],
  { limit = 30, since, until }: PortalTrendEvidenceOptions = {},
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalTweet[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
  const candidateLimit = Math.min(50, Math.max(safeLimit * 2, 30))
  const responses = await runBatched(
    includeTerms.map(
      (term) => () =>
        fetcher<ClickHouseSearchResponse>(
          ['search'],
          (() => {
            const params = new URLSearchParams({
              q: term,
              mode: 'all',
              limit: String(candidateLimit),
              offset: '0',
            })
            if (since) params.set('since', since)
            if (until) params.set('until', until)
            return params
          })(),
          { timeoutMs: 30_000 },
        ),
    ),
    // The current query gateway intentionally serializes corpus searches.
    // Keep evidence requests ordered while trend aggregation stays concurrent.
    1,
  )

  const unique = new Map<string, PortalTweet>()
  for (const response of responses) {
    if (!Array.isArray(response.data?.tweets)) {
      throw new Error('ClickHouse search returned an invalid response')
    }
    for (const row of response.data.tweets) {
      if (
        !/^\d{1,32}$/.test(row.tweetId) ||
        !/^\d{1,32}$/.test(row.accountId) ||
        typeof row.fullText !== 'string'
      ) {
        throw new Error('ClickHouse search returned an invalid tweet')
      }
      const username = row.username || 'unknown'
      const createdAt = safeTimestamp(row.createdAt, 'trend tweet timestamp')
      unique.set(row.tweetId, {
        id: row.tweetId,
        username,
        name: row.accountDisplayName || username,
        avatar: row.avatarMediaUrl || null,
        text: row.fullText,
        observedAt: createdAt,
        createdAt,
        likes: safeCount(row.favoriteCount, 'trend tweet favorite count'),
        rts: safeCount(row.retweetCount, 'trend tweet repost count'),
      })
    }
  }

  return Array.from(unique.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime() || right.id.localeCompare(left.id),
    )
    .slice(0, safeLimit)
}

export async function fetchPortalLiveAnalytics(
  now = new Date(),
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalLiveAnalytics> {
  const start = daysBefore(now, 1)
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
    streamedLast24Hours: safeCount(
      stream.summary.totalTweets,
      'last-24-hours streamed count',
    ),
    generatedAt: safeTimestamp(summary.data.collectedAt, 'snapshot timestamp'),
    latestObservedAt: stream.summary.latestObservedAt
      ? safeTimestamp(stream.summary.latestObservedAt, 'observation timestamp')
      : null,
  }
}

/** Recent original posts from current archive uploaders and opted-in members. */
export async function fetchPortalRecentBangers(
  limit = 50,
  hours = 48,
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalTweet[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
  const safeHours = Math.max(1, Math.min(168, Math.trunc(hours)))
  const response = await fetcher<ClickHouseRecentBangersResponse>(
    ['recent-bangers'],
    new URLSearchParams({
      limit: String(safeLimit),
      hours: String(safeHours),
    }),
    { timeoutMs: 30_000, revalidate: 1_800 },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('ClickHouse recent-bangers returned an invalid response')
  }

  return response.data.map((row) => {
    if (
      !/^\d{1,32}$/.test(row.tweetId) ||
      !/^\d{1,32}$/.test(row.accountId) ||
      typeof row.fullText !== 'string'
    ) {
      throw new Error('ClickHouse recent-bangers returned an invalid tweet')
    }
    const username = row.username || 'unknown'
    return {
      id: row.tweetId,
      username,
      name: row.accountDisplayName || username,
      avatar: row.avatarMediaUrl || null,
      text: row.fullText,
      observedAt: safeTimestamp(
        row.latestObservedAt,
        'banger observation timestamp',
      ),
      createdAt: safeTimestamp(row.createdAt, 'banger authored timestamp'),
      likes: safeCount(row.favoriteCount, 'banger favorite count'),
      rts: safeCount(row.retweetCount, 'banger repost count'),
      quoteCount: safeCount(row.quoteCount, 'banger quote count'),
    }
  })
}

/** Canonical all-time banger ranking used for the historical daily choice. */
function mapHistoricalBangers(
  response: ClickHouseTopQuotesResponse,
): PortalTweet[] {
  if (!Array.isArray(response.data)) {
    throw new Error('ClickHouse top-quotes returned an invalid response')
  }

  return response.data.map((row) => {
    if (
      !/^\d{1,32}$/.test(row.tweetId) ||
      !row.accountId ||
      !/^\d{1,32}$/.test(row.accountId) ||
      !row.createdAt ||
      typeof row.fullText !== 'string'
    ) {
      throw new Error('ClickHouse top-quotes returned an invalid tweet')
    }
    const username = row.username || 'unknown'
    const createdAt = safeTimestamp(
      row.createdAt,
      'historical banger timestamp',
    )
    return {
      id: row.tweetId,
      username,
      name: row.displayName || username,
      avatar: row.avatarMediaUrl || null,
      text: row.fullText,
      observedAt: createdAt,
      createdAt,
      likes: safeCount(row.favoriteCount, 'historical banger favorite count'),
      rts: safeCount(row.retweetCount, 'historical banger repost count'),
      quoteCount: safeCount(row.quoteCount, 'historical banger quote count'),
    }
  })
}

function safeBangersPagination(
  value: ClickHouseTopQuotesResponse['pagination'],
): PortalBangersPage['pagination'] {
  if (!value || !Array.isArray(value.yearCounts)) {
    throw new Error('ClickHouse top-quotes returned invalid pagination')
  }
  const limit = safeCount(value.limit, 'banger page limit')
  const offset = safeCount(value.offset, 'banger page offset')
  const totalAvailable = safeCount(
    value.totalAvailable,
    'banger total available',
  )
  const snapshotSize = safeCount(value.snapshotSize, 'banger snapshot size')
  const nextOffset =
    value.nextOffset === null
      ? null
      : safeCount(value.nextOffset, 'banger next offset')
  const yearCounts = value.yearCounts.map(({ year, count }) => {
    if (!Number.isInteger(year) || year < 2006 || year > 2200) {
      throw new Error('ClickHouse top-quotes returned an invalid banger year')
    }
    return { year, count: safeCount(count, 'banger year count') }
  })

  return {
    limit,
    offset,
    nextOffset,
    totalAvailable,
    snapshotSize,
    yearCounts,
    candidateRankingTruncated: value.candidateRankingTruncated === true,
  }
}

export async function fetchPortalBangersPage(
  {
    limit = 60,
    offset = 0,
    sort = 'quotes',
    scope = 'all',
    year,
    query = '',
  }: {
    limit?: number
    offset?: number
    sort?: PortalBangersSort
    scope?: PortalBangersScope
    year?: number
    query?: string
  } = {},
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalBangersPage> {
  const params = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, Math.trunc(limit)))),
    offset: String(Math.max(0, Math.min(1_000_000, Math.trunc(offset)))),
    sort: sort === 'recent' ? 'recent' : 'quotes',
    exclude_self: 'true',
    target_ca_users_only: scope === 'members' ? 'true' : 'false',
    quote_ca_users_only: 'true',
  })
  if (year !== undefined) params.set('year', String(year))
  const safeQuery = query.trim().slice(0, 120)
  if (safeQuery) params.set('q', safeQuery)

  const response = await fetcher<ClickHouseTopQuotesResponse>(
    ['top-quotes'],
    params,
    { timeoutMs: 30_000 },
  )
  return {
    tweets: mapHistoricalBangers(response),
    pagination: safeBangersPagination(response.pagination),
  }
}

export async function fetchPortalHistoricalBangers(
  limit = 100,
  fetcher: AnalyticsFetcher = fetchAnalyticsGatewayJson,
): Promise<PortalTweet[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const response = await fetcher<ClickHouseTopQuotesResponse>(
    ['top-quotes'],
    new URLSearchParams({
      limit: String(safeLimit),
      exclude_self: 'true',
      target_ca_users_only: 'false',
      quote_ca_users_only: 'true',
    }),
    { timeoutMs: 30_000, revalidate: 86_400 },
  )
  return mapHistoricalBangers(response)
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
    const rows = new Map<number, ClickHouseTrendRow>()
    for (const row of yearlyResponses[index].data) {
      const bucket = new Date(normalizeClickHouseTimestamp(row.bucket))
      if (Number.isNaN(bucket.getTime())) {
        throw new Error('ClickHouse word-trend returned an invalid bucket')
      }
      rows.set(bucket.getUTCFullYear(), row)
    }
    return {
      term,
      color,
      tweetsPerYear: years.map((year) => {
        const row = rows.get(year)
        return row ? safeCount(row.tweets, 'trend tweet count') : 0
      }),
      perYear: years.map((year) => {
        const row = rows.get(year)
        return row ? ratePerHundredThousand(row) : 0
      }),
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
