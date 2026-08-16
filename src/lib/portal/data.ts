import 'server-only'
import { unstable_cache } from 'next/cache'
import {
  clickHouseAnalyticsGatewayBaseUrl,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import {
  fetchPortalBangersPage,
  fetchPortalHistoricalBangers,
  fetchPortalLiveAnalytics,
  fetchPortalRecentBangers,
  fetchPortalTrends,
} from './analytics'
import { getResearchPosts, selectFeaturedResearchPosts } from './research'
import { selectHomepageStream } from './stream'
import type {
  PortalBangersPage,
  PortalBangersPeriod,
  PortalBangersScope,
  PortalBangersSort,
  PortalData,
  PortalMedia,
  PortalQuotedTweet,
  PortalStats,
  PortalTrends,
  PortalTweet,
} from './types'

interface PortalReadConfig {
  url: string
  anonKey: string
  sourceId: string
}

export interface PortalStreamUpdateCursor {
  observedAt: string
  id: string
}

export interface PortalStreamPageCursor {
  createdAt: string
  id: string
}

interface PortalCorpusRange {
  firstYear: number
  currentYear: number
}

interface PortalCorpusStats {
  totalTweets: number
  generatedAt: string
}

interface ClickHouseCorpusCountResponse {
  data: {
    totalTweets: unknown
    sourceUpdatedAt: unknown
    collectedAt: unknown
    source: 'clickhouse.tweet_content_versions'
    countMode: 'unique_tweets_observed'
  }
}

const PORTAL_READ_TIMEOUT_MS = 10_000
export const PORTAL_BANGERS_PAGE_SIZE = 30

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function resolvePortalReadConfig(
  env: NodeJS.ProcessEnv = process.env,
): PortalReadConfig {
  const explicitUrl = env.PORTAL_READ_SUPABASE_URL
  const explicitAnonKey = env.PORTAL_READ_SUPABASE_ANON_KEY
  if (Boolean(explicitUrl) !== Boolean(explicitAnonKey)) {
    throw new Error(
      'PORTAL_READ_SUPABASE_URL and PORTAL_READ_SUPABASE_ANON_KEY must be configured together',
    )
  }

  const useLocal =
    env.NODE_ENV === 'development' &&
    env.NEXT_PUBLIC_USE_REMOTE_DEV_DB !== 'true' &&
    !explicitUrl
  const url = required(
    explicitUrl ||
      (useLocal
        ? env.NEXT_PUBLIC_LOCAL_SUPABASE_URL
        : env.NEXT_PUBLIC_SUPABASE_URL),
    explicitUrl ? 'PORTAL_READ_SUPABASE_URL' : 'NEXT_PUBLIC_SUPABASE_URL',
  )
  const anonKey = required(
    explicitAnonKey ||
      (useLocal
        ? env.NEXT_PUBLIC_LOCAL_ANON_KEY
        : env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    explicitAnonKey
      ? 'PORTAL_READ_SUPABASE_ANON_KEY'
      : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )

  let sourceId: string
  try {
    sourceId = new URL(url).hostname
  } catch {
    throw new Error('Portal read Supabase URL is invalid')
  }
  return { url, anonKey, sourceId }
}

export function portalDataSourceKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const portalRead = resolvePortalReadConfig(env)
  const analyticsUrl = required(
    clickHouseAnalyticsGatewayBaseUrl(
      env.CLICKHOUSE_ANALYTICS_API_URL ?? '',
      env.CLICKHOUSE_SEARCH_API_URL ?? '',
    ),
    'CLICKHOUSE_ANALYTICS_API_URL',
  )
  let analyticsSource: string
  try {
    analyticsSource = new URL(analyticsUrl).hostname
  } catch {
    throw new Error('ClickHouse analytics URL is invalid')
  }
  const environment = env.VERCEL_ENV || env.NODE_ENV || 'unknown'
  return `portal-v5:${environment}:${analyticsSource}:${portalRead.sourceId}`
}

interface PortalRestOptions {
  method?: 'GET' | 'HEAD'
  prefer?: string
}

async function portalRestRequest(
  table: string,
  params: URLSearchParams,
  options: PortalRestOptions = {},
): Promise<Response> {
  const { url, anonKey } = resolvePortalReadConfig()
  const response = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/${table}?${params.toString()}`,
    {
      method: options.method ?? 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Accept-Profile': 'public',
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(PORTAL_READ_TIMEOUT_MS),
    },
  )

  if (!response.ok) {
    const detail =
      options.method === 'HEAD'
        ? ''
        : `: ${(await response.text()).slice(0, 500)}`
    throw new Error(
      `Portal ${table} query failed (${response.status})${detail}`,
    )
  }
  return response
}

async function portalRestRows<T>(
  table: string,
  params: URLSearchParams,
): Promise<T[]> {
  const response = await portalRestRequest(table, params)
  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error(`Portal ${table} query returned an invalid response`)
  }
  return data as T[]
}

async function optionalPortalRestRows<T>(
  table: string,
  params: URLSearchParams,
  label: string,
): Promise<T[]> {
  return (await optionalPortalRestResult<T>(table, params, label)).rows
}

async function optionalPortalRestResult<T>(
  table: string,
  params: URLSearchParams,
  label: string,
): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await portalRestRows<T>(table, params), failed: false }
  } catch (error) {
    console.error(`Portal ${label} query failed:`, error)
    return { rows: [], failed: true }
  }
}

function exactCount(response: Response, label: string): number {
  const contentRange = response.headers.get('content-range')
  const countText = contentRange?.split('/').at(-1)
  const count = countText ? Number(countText) : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Portal ${label} count returned an invalid response`)
  }
  return count
}

function portalSnapshotCount(value: number | null, label: string): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Portal ${label} returned an invalid response`)
  }
  return value
}

function portalSnapshotTimestamp(value: string, label: string): string {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Portal ${label} returned an invalid response`)
  }
  return timestamp.toISOString()
}

function portalClickHouseTimestamp(value: string, label: string): string {
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`
  return portalSnapshotTimestamp(normalized, label)
}

function portalClickHouseCount(value: unknown, label: string): number {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && !/^\d+$/.test(value))
  ) {
    throw new Error(`Portal ${label} returned an invalid response`)
  }
  return portalSnapshotCount(Number(value), label)
}

async function fetchSupabasePortalCorpusStats(): Promise<PortalCorpusStats> {
  const rows = await portalRestRows<{
    total_tweets: number | null
    last_updated: string
  }>(
    'global_activity_summary',
    new URLSearchParams({ select: 'total_tweets,last_updated' }),
  )
  if (rows.length !== 1) {
    throw new Error('Portal corpus summary returned an invalid response')
  }
  return {
    totalTweets: portalSnapshotCount(
      rows[0].total_tweets,
      'corpus tweet count',
    ),
    generatedAt: portalSnapshotTimestamp(
      rows[0].last_updated,
      'corpus summary timestamp',
    ),
  }
}

/**
 * ClickHouse owns the live analytical corpus count. Supabase's daily summary
 * remains a last-known-good fallback during gateway or projection failures.
 */
export async function fetchPortalCorpusStats(): Promise<PortalCorpusStats> {
  try {
    const response =
      await fetchAnalyticsGatewayJson<ClickHouseCorpusCountResponse>(
        ['corpus-count'],
        new URLSearchParams(),
        { timeoutMs: PORTAL_READ_TIMEOUT_MS },
      )
    return {
      totalTweets: portalClickHouseCount(
        response.data.totalTweets,
        'ClickHouse corpus tweet count',
      ),
      generatedAt: portalClickHouseTimestamp(
        String(response.data.collectedAt),
        'ClickHouse corpus count timestamp',
      ),
    }
  } catch (error) {
    console.error(
      'Portal ClickHouse corpus count failed; falling back to Supabase:',
      error,
    )
    return fetchSupabasePortalCorpusStats()
  }
}

/** Archive uploaders plus opted-in members, deduplicated by production. */
export async function fetchPortalMemberCount(): Promise<number> {
  const membersResponse = await portalRestRequest(
    'user_directory',
    new URLSearchParams({ select: 'directory_id' }),
    { method: 'HEAD', prefer: 'count=exact' },
  )
  return exactCount(membersResponse, 'member')
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function validatedUpdateCursor(
  cursor: PortalStreamUpdateCursor,
): PortalStreamUpdateCursor {
  const observedAt = new Date(cursor.observedAt)
  if (Number.isNaN(observedAt.getTime()) || !/^\d{1,32}$/.test(cursor.id)) {
    throw new Error('Invalid portal stream cursor')
  }
  return { observedAt: observedAt.toISOString(), id: cursor.id }
}

function validatedPageCursor(
  cursor: PortalStreamPageCursor,
): PortalStreamPageCursor {
  const createdAt = new Date(cursor.createdAt)
  if (Number.isNaN(createdAt.getTime()) || !/^\d{1,32}$/.test(cursor.id)) {
    throw new Error('Invalid portal stream cursor')
  }
  return { createdAt: createdAt.toISOString(), id: cursor.id }
}

interface ClickHousePortalStreamTweet {
  tweetId: string
  accountId: string
  createdAt: string
  latestObservedAt: string
  fullText: string
  favoriteCount: string | number
  retweetCount: string | number
  followerCount: string | number
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
  media: Array<{
    mediaUrl: string
    mediaType: string
    width: number | null
    height: number | null
  }>
}

interface ClickHousePortalStreamResponse {
  data: {
    tweets: ClickHousePortalStreamTweet[]
    updateCursor: { observedAt: string; tweetId: string } | null
  }
}

function clickHousePortalCount(value: string | number, field: string): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`ClickHouse portal stream returned an invalid ${field}`)
  }
  return count
}

function clickHousePortalTimestamp(value: string, field: string): string {
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`
  const timestamp = new Date(normalized)
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`ClickHouse portal stream returned an invalid ${field}`)
  }
  return timestamp.toISOString()
}

function mapClickHousePortalStreamTweet(
  row: ClickHousePortalStreamTweet,
): PortalTweet {
  if (
    !/^\d{1,32}$/.test(row.tweetId) ||
    !/^\d{1,32}$/.test(row.accountId) ||
    typeof row.fullText !== 'string'
  ) {
    throw new Error('ClickHouse portal stream returned an invalid tweet')
  }
  const username = row.username || 'unknown'
  return {
    id: row.tweetId,
    accountId: row.accountId,
    username,
    name: row.accountDisplayName || username,
    avatar: row.avatarMediaUrl || null,
    text: row.fullText,
    observedAt: clickHousePortalTimestamp(
      row.latestObservedAt,
      'observation timestamp',
    ),
    createdAt: clickHousePortalTimestamp(row.createdAt, 'authored timestamp'),
    likes: clickHousePortalCount(row.favoriteCount, 'favorite count'),
    rts: clickHousePortalCount(row.retweetCount, 'repost count'),
    followers: clickHousePortalCount(row.followerCount, 'follower count'),
    media: (row.media || []).flatMap((item): PortalMedia[] => {
      if (!item.mediaUrl || !item.mediaType) return []
      return [
        {
          url: item.mediaUrl,
          type: item.mediaType,
          ...(item.width && item.width > 0 ? { width: item.width } : {}),
          ...(item.height && item.height > 0 ? { height: item.height } : {}),
        },
      ]
    }),
  }
}

async function fetchClickHousePortalStream(
  limit: number,
  cursor?: PortalStreamPageCursor | PortalStreamUpdateCursor,
): Promise<PortalTweet[]> {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(Math.trunc(limit), 1), 100)),
  })
  if (cursor && 'createdAt' in cursor) {
    const before = validatedPageCursor(cursor)
    params.set('before', before.createdAt)
    params.set('before_id', before.id)
  } else if (cursor) {
    const after = validatedUpdateCursor(cursor)
    params.set('after', after.observedAt)
    params.set('after_id', after.id)
  }

  const response =
    await fetchAnalyticsGatewayJson<ClickHousePortalStreamResponse>(
      ['portal-stream'],
      params,
      { timeoutMs: 20_000 },
    )
  if (!Array.isArray(response.data?.tweets)) {
    throw new Error('ClickHouse portal-stream returned an invalid response')
  }
  return response.data.tweets.map(mapClickHousePortalStreamTweet)
}

/** A page of firehose tweets ordered by authored time, newest first. */
export async function getPortalStreamPage(
  limit = 30,
  cursor?: PortalStreamPageCursor,
): Promise<PortalTweet[]> {
  return fetchClickHousePortalStream(limit, cursor)
}

/** Rows newly observed by the firehose, used to refresh an open stream. */
export async function getPortalStreamUpdates(
  limit = 100,
  cursor?: PortalStreamUpdateCursor,
): Promise<PortalTweet[]> {
  return fetchClickHousePortalStream(limit, cursor)
}

interface PortalMediaRow {
  tweet_id: string
  media_url: string
  media_type: string
  width: number | null
  height: number | null
}

interface PortalQuoteRelationRow {
  tweet_id: string
  quoted_tweet_id: string
}

interface PortalQuotedTweetRow {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number | null
  username: string | null
  account_display_name: string | null
  avatar_media_url: string | null
}

function portalIdFilter(ids: string[]): string | null {
  const safeIds = Array.from(new Set(ids.filter((id) => /^\d{1,32}$/.test(id))))
  return safeIds.length > 0 ? `in.(${safeIds.join(',')})` : null
}

function portalCount(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

function mediaByTweet(rows: PortalMediaRow[]): Map<string, PortalMedia[]> {
  const grouped = new Map<string, PortalMedia[]>()
  for (const row of rows) {
    if (!row.media_url || !row.media_type) continue
    const media = grouped.get(row.tweet_id) ?? []
    media.push({
      url: row.media_url,
      type: row.media_type,
      ...(row.width && row.width > 0 ? { width: row.width } : {}),
      ...(row.height && row.height > 0 ? { height: row.height } : {}),
    })
    grouped.set(row.tweet_id, media)
  }
  return grouped
}

/** Attach image and quoted-tweet data to portal rows in bounded batch reads. */
export async function enrichPortalTweets(
  tweets: PortalTweet[],
): Promise<PortalTweet[]> {
  const tweetIdFilter = portalIdFilter(tweets.map(({ id }) => id))
  if (!tweetIdFilter) return tweets
  const needsOwnMedia = tweets.some((tweet) => tweet.media === undefined)

  const [mediaRows, quoteRelations] = await Promise.all([
    needsOwnMedia
      ? optionalPortalRestRows<PortalMediaRow>(
          'tweet_media',
          new URLSearchParams({
            select: 'tweet_id,media_url,media_type,width,height',
            tweet_id: tweetIdFilter,
            order: 'media_id.asc',
          }),
          'media',
        )
      : Promise.resolve([]),
    optionalPortalRestRows<PortalQuoteRelationRow>(
      'quote_tweets',
      new URLSearchParams({
        select: 'tweet_id,quoted_tweet_id',
        tweet_id: tweetIdFilter,
      }),
      'quote relationship',
    ),
  ])

  const quoteByTweetId = new Map(
    quoteRelations.map((row) => [row.tweet_id, row.quoted_tweet_id]),
  )
  const quotedTweetIdFilter = portalIdFilter(
    quoteRelations.map(({ quoted_tweet_id }) => quoted_tweet_id),
  )
  const ownMediaByTweetId = mediaByTweet(mediaRows)

  if (!quotedTweetIdFilter) {
    return tweets.map((tweet) => ({
      ...tweet,
      media: ownMediaByTweetId.get(tweet.id) ?? tweet.media ?? [],
    }))
  }

  const [quotedResult, quotedMediaRows] = await Promise.all([
    optionalPortalRestResult<PortalQuotedTweetRow>(
      'enriched_tweets',
      new URLSearchParams({
        select:
          'tweet_id,account_id,created_at,full_text,retweet_count,favorite_count,username,account_display_name,avatar_media_url',
        tweet_id: quotedTweetIdFilter,
      }),
      'quoted tweet',
    ),
    optionalPortalRestRows<PortalMediaRow>(
      'tweet_media',
      new URLSearchParams({
        select: 'tweet_id,media_url,media_type,width,height',
        tweet_id: quotedTweetIdFilter,
        order: 'media_id.asc',
      }),
      'quoted tweet media',
    ),
  ])

  const quotedMediaByTweetId = mediaByTweet(quotedMediaRows)
  const quotedTweets = new Map<string, PortalQuotedTweet>()
  for (const row of quotedResult.rows) {
    const username = row.username || 'unknown'
    quotedTweets.set(row.tweet_id, {
      id: row.tweet_id,
      accountId: row.account_id,
      username,
      name: row.account_display_name || username,
      avatar: row.avatar_media_url,
      text: row.full_text || '',
      createdAt: row.created_at,
      likes: portalCount(row.favorite_count),
      rts: portalCount(row.retweet_count),
      media: quotedMediaByTweetId.get(row.tweet_id) ?? [],
    })
  }

  return tweets.map((tweet) => {
    const quotedTweetId = quoteByTweetId.get(tweet.id)
    const quotedTweet = quotedTweetId
      ? (quotedTweets.get(quotedTweetId) ??
        (quotedResult.failed
          ? undefined
          : {
              id: quotedTweetId,
              username: 'unknown',
              name: 'Unknown',
              avatar: null,
              text: '',
              createdAt: tweet.createdAt,
              likes: 0,
              rts: 0,
              media: [],
              isDeleted: true,
            }))
      : undefined

    return {
      ...tweet,
      media: ownMediaByTweetId.get(tweet.id) ?? tweet.media ?? [],
      ...(quotedTweet ? { quotedTweet } : {}),
    }
  })
}

function calendarDayDistance(left: Date, right: Date): number {
  const anchorYear = 2000
  const leftDay = Date.UTC(anchorYear, left.getUTCMonth(), left.getUTCDate())
  const rightDay = Date.UTC(anchorYear, right.getUTCMonth(), right.getUTCDate())
  const distance = Math.abs(leftDay - rightDay) / 86_400_000
  return Math.min(distance, 366 - distance)
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

/**
 * Put one deterministic daily choice first, selected from the ten strongest
 * bangers closest to today's calendar date in previous years.
 */
export function selectDailyBangers(
  tweets: PortalTweet[],
  now = new Date(),
  poolSize = 10,
): PortalTweet[] {
  const candidates = tweets
    .filter((tweet) => {
      const createdAt = new Date(tweet.createdAt)
      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.getUTCFullYear() < now.getUTCFullYear()
      )
    })
    .sort((left, right) => {
      const distance =
        calendarDayDistance(new Date(left.createdAt), now) -
        calendarDayDistance(new Date(right.createdAt), now)
      return (
        distance ||
        (right.quoteCount ?? 0) - (left.quoteCount ?? 0) ||
        right.likes - left.likes ||
        left.id.localeCompare(right.id)
      )
    })
    .slice(0, Math.max(1, poolSize))

  if (candidates.length < 2) return candidates
  const day = now.toISOString().slice(0, 10)
  const selectedIndex = stableHash(day) % candidates.length
  const selected = candidates[selectedIndex]
  return [selected, ...candidates.filter((_, index) => index !== selectedIndex)]
}

/**
 * Put one deterministic daily choice first, selected from the strongest
 * bangers in the rolling 24-hour window.
 */
export function selectDailyRecentBangers(
  tweets: PortalTweet[],
  now = new Date(),
  poolSize = 10,
): PortalTweet[] {
  const windowEnd = now.getTime()
  const windowStart = windowEnd - 24 * 60 * 60 * 1_000
  const candidates = tweets
    .filter((tweet) => {
      const createdAt = new Date(tweet.createdAt)
      const createdAtTime = createdAt.getTime()
      return (
        !Number.isNaN(createdAtTime) &&
        createdAtTime >= windowStart &&
        createdAtTime <= windowEnd
      )
    })
    .sort((left, right) => {
      return (
        (right.quoteCount ?? 0) - (left.quoteCount ?? 0) ||
        right.likes - left.likes ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        right.id.localeCompare(left.id)
      )
    })
    .slice(0, Math.max(1, poolSize))

  if (candidates.length < 2) return candidates
  const day = now.toISOString().slice(0, 10)
  const selectedIndex = stableHash(day) % candidates.length
  const selected = candidates[selectedIndex]
  return [selected, ...candidates.filter((_, index) => index !== selectedIndex)]
}

async function fetchCorpusRange(): Promise<PortalCorpusRange> {
  const [firstResult, latestResult] = await Promise.all([
    portalRestRows<{ created_at: string }>(
      'tweets',
      new URLSearchParams({
        select: 'created_at',
        created_at: 'gte.2006-01-01',
        order: 'created_at.asc',
        limit: '1',
      }),
    ),
    portalRestRows<{ created_at: string }>(
      'tweets',
      new URLSearchParams({
        select: 'created_at',
        created_at: 'gte.2006-01-01',
        order: 'created_at.desc',
        limit: '1',
      }),
    ),
  ])
  const first = firstResult[0]?.created_at
  const latest = latestResult[0]?.created_at
  if (!first || !latest) throw new Error('Portal corpus is empty')
  return {
    firstYear: new Date(first).getUTCFullYear(),
    currentYear: new Date(latest).getUTCFullYear(),
  }
}

async function fetchPortalJoinedThisWeek(): Promise<number> {
  const response = await portalRestRequest(
    'archive_upload',
    new URLSearchParams({
      select: 'id',
      created_at: `gte.${isoDaysAgo(7)}`,
    }),
    { method: 'HEAD', prefer: 'count=exact' },
  )
  return exactCount(response, 'upload')
}

// Arguments participate in the cache key, keeping staging/prod sources and
// deployment environments isolated even when the Data Cache survives deploys.
const getCachedTrendsSnapshot = unstable_cache(
  async (_sourceKey: string) => fetchPortalTrends(),
  ['portal-trends-snapshot-v1'],
  { revalidate: 86_400 },
)
const getCachedCorpusRange = unstable_cache(
  async (_sourceKey: string) => fetchCorpusRange(),
  ['portal-corpus-range-v1'],
  { revalidate: 86_400 },
)
const getCachedCorpusStats = unstable_cache(
  async (_sourceKey: string) => fetchPortalCorpusStats(),
  ['portal-corpus-stats-v1'],
  { revalidate: 300 },
)
const getCachedLiveAnalytics = unstable_cache(
  async (_sourceKey: string) => fetchPortalLiveAnalytics(),
  ['portal-live-analytics-v1'],
  { revalidate: 300 },
)
const getCachedMemberCount = unstable_cache(
  async (_sourceKey: string) => fetchPortalMemberCount(),
  ['portal-member-count-v1'],
  { revalidate: 300 },
)
const getCachedJoinedThisWeek = unstable_cache(
  async (_sourceKey: string) => fetchPortalJoinedThisWeek(),
  ['portal-joined-this-week-v1'],
  { revalidate: 300 },
)
const getCachedHomepageStreamCandidates = unstable_cache(
  async (_sourceKey: string) => getPortalStreamPage(100),
  ['portal-home-stream-candidates-v1'],
  { revalidate: 60 },
)
const getCachedHistoricalBangers = unstable_cache(
  async (_sourceKey: string, day: string) => {
    const ranked = await fetchPortalHistoricalBangers(100)
    return enrichPortalTweets(
      selectDailyBangers(ranked, new Date(`${day}T12:00:00.000Z`)),
    )
  },
  ['portal-bangers-v6'],
  { revalidate: 86_400 },
)
const getCachedRecentBangers = unstable_cache(
  async (_sourceKey: string, _day: string) =>
    enrichPortalTweets(
      selectDailyRecentBangers(await fetchPortalRecentBangers(50, 24)),
    ),
  ['portal-recent-bangers-v5'],
  { revalidate: 1_800 },
)

function portalBangersPeriodRange(
  period: PortalBangersPeriod,
  now = new Date(),
): { createdAfter: string; createdBefore: string } {
  const start = new Date(now)
  if (period === 'today') {
    start.setUTCDate(start.getUTCDate() - 1)
  } else if (period === 'week') {
    start.setUTCDate(start.getUTCDate() - 7)
  } else {
    start.setUTCMonth(start.getUTCMonth() - 3)
  }
  return {
    createdAfter: start.toISOString(),
    createdBefore: now.toISOString(),
  }
}

const getCachedPortalBangersPeriodPage = unstable_cache(
  async (
    _sourceKey: string,
    period: PortalBangersPeriod,
    limit: number,
    offset: number,
    sort: PortalBangersSort,
    scope: PortalBangersScope,
    query: string,
  ): Promise<PortalBangersPage> => {
    const range = portalBangersPeriodRange(period)
    const page = await fetchPortalBangersPage({
      limit,
      offset,
      sort,
      scope,
      query,
      ...range,
    })
    return {
      ...page,
      tweets: await enrichPortalTweets(page.tweets),
    }
  },
  ['portal-bangers-period-page-v1'],
  { revalidate: 300 },
)

const getCachedInitialBangersPage = unstable_cache(
  async (
    _sourceKey: string,
    scope: PortalBangersScope,
    sort: PortalBangersSort,
    year: number | null,
  ) =>
    getPortalBangersPage({
      limit: PORTAL_BANGERS_PAGE_SIZE,
      scope,
      sort,
      ...(year === null ? {} : { year }),
    }),
  ['portal-initial-bangers-page-v1'],
  { revalidate: 300 },
)
export async function loadOptionalPortalData<T>(
  section: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  return (await loadPortalComponentData(section, loader, fallback)).data
}

export async function loadPortalComponentData<T>(
  section: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await loader(), failed: false }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Portal component data failed',
        section,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { data: fallback, failed: true }
  }
}

export async function getPortalBangersPage(
  options: {
    limit?: number
    offset?: number
    sort?: PortalBangersSort
    scope?: PortalBangersScope
    year?: number
    period?: PortalBangersPeriod
    query?: string
  } = {},
): Promise<PortalBangersPage> {
  if (options.period) {
    const limit = Math.max(
      1,
      Math.min(100, Math.trunc(options.limit ?? PORTAL_BANGERS_PAGE_SIZE)),
    )
    const offset = Math.max(
      0,
      Math.min(1_000_000, Math.trunc(options.offset ?? 0)),
    )
    const sort = options.sort ?? 'quotes'
    const scope = options.scope ?? 'all'
    const query = options.query?.trim().slice(0, 120) ?? ''
    return getCachedPortalBangersPeriodPage(
      portalDataSourceKey(),
      options.period,
      limit,
      offset,
      sort,
      scope,
      query,
    )
  }

  const page = await fetchPortalBangersPage(options)
  return {
    ...page,
    tweets: await enrichPortalTweets(page.tweets),
  }
}

export async function getInitialPortalBangersPage(
  options: {
    sort?: PortalBangersSort
    scope?: PortalBangersScope
    year?: number
    period?: PortalBangersPeriod
    query?: string
  } = {},
): Promise<PortalBangersPage> {
  const scope = options.scope ?? 'all'
  const sort = options.sort ?? 'quotes'
  const query = options.query?.trim() ?? ''
  if (query || options.period) {
    return getPortalBangersPage({
      limit: PORTAL_BANGERS_PAGE_SIZE,
      scope,
      sort,
      ...(options.period ? { period: options.period } : { year: options.year }),
      query,
    })
  }
  return getCachedInitialBangersPage(
    portalDataSourceKey(),
    scope,
    sort,
    options.year ?? null,
  )
}

/** Cached corpus-wide seed series for the authenticated trends explorer. */
export async function getPortalTrendSnapshot(): Promise<PortalTrends> {
  return getCachedTrendsSnapshot(portalDataSourceKey())
}

export async function getPortalData(
  view: 'home' | 'stream' = 'home',
): Promise<PortalData> {
  const sourceKey = portalDataSourceKey()
  const today = new Date().toISOString().slice(0, 10)
  const [
    trends,
    corpusRange,
    corpusStats,
    liveAnalytics,
    memberCount,
    joinedThisWeek,
    initialStream,
    research,
    recentBangers,
    historicalBangers,
  ] = await Promise.all([
    view === 'home'
      ? loadPortalComponentData(
          'trends',
          () => getCachedTrendsSnapshot(sourceKey),
          { years: [], series: [], weekly: [], computedAt: '' },
        )
      : Promise.resolve({
          data: { years: [], series: [], weekly: [], computedAt: '' },
          failed: false,
        }),
    view === 'home'
      ? loadPortalComponentData(
          'corpus-range',
          () => getCachedCorpusRange(sourceKey),
          { firstYear: 0, currentYear: 0 },
        )
      : Promise.resolve({
          data: { firstYear: 0, currentYear: 0 },
          failed: false,
        }),
    loadPortalComponentData(
      'corpus-stats',
      () => getCachedCorpusStats(sourceKey),
      { totalTweets: 0, generatedAt: new Date().toISOString() },
    ),
    view === 'home'
      ? loadPortalComponentData(
          'live-analytics',
          () => getCachedLiveAnalytics(sourceKey),
          {
            streamedLast24Hours: 0,
            latestObservedAt: null,
          },
        )
      : Promise.resolve({
          data: { streamedLast24Hours: 0, latestObservedAt: null },
          failed: false,
        }),
    view === 'home'
      ? loadPortalComponentData(
          'member-count',
          () => getCachedMemberCount(sourceKey),
          0,
        )
      : Promise.resolve({ data: 0, failed: false }),
    view === 'home'
      ? loadPortalComponentData(
          'joined-this-week',
          () => getCachedJoinedThisWeek(sourceKey),
          0,
        )
      : Promise.resolve({ data: 0, failed: false }),
    loadPortalComponentData(
      'initial-stream',
      () =>
        view === 'home'
          ? getCachedHomepageStreamCandidates(sourceKey)
          : getPortalStreamPage(30),
      [],
    ),
    view === 'home'
      ? loadPortalComponentData(
          'research',
          async () => selectFeaturedResearchPosts(await getResearchPosts(24)),
          [],
        )
      : Promise.resolve({ data: [], failed: false }),
    view === 'home'
      ? loadPortalComponentData(
          'recent-bangers',
          () => getCachedRecentBangers(sourceKey, today),
          [],
        )
      : Promise.resolve({ data: [], failed: false }),
    view === 'home'
      ? loadPortalComponentData(
          'historical-bangers',
          () => getCachedHistoricalBangers(sourceKey, today),
          [],
        )
      : Promise.resolve({ data: [], failed: false }),
  ])
  const stats: PortalStats = {
    totalTweets: corpusStats.data.totalTweets,
    accountCount: memberCount.data,
    streamedLast24Hours: liveAnalytics.data.streamedLast24Hours,
    joinedThisWeek: joinedThisWeek.data,
    firstYear: corpusRange.data.firstYear,
    currentYear: corpusRange.data.currentYear,
    generatedAt: corpusStats.data.generatedAt,
  }
  const selectedStream =
    view === 'home'
      ? selectHomepageStream(
          [...initialStream.data, ...recentBangers.data],
          30,
          new Date(corpusStats.data.generatedAt),
        )
      : initialStream.data
  return {
    stats,
    trends: trends.data,
    initialStream: selectedStream,
    research: research.data,
    recentBangers: recentBangers.data,
    historicalBangers: historicalBangers.data,
    failures: {
      liveAnalytics: corpusStats.failed || liveAnalytics.failed,
      memberCount: memberCount.failed,
      joinedThisWeek: joinedThisWeek.failed,
      corpusRange: corpusRange.failed,
      trends: trends.failed,
      initialStream: initialStream.failed,
      research: research.failed,
      recentBangers: recentBangers.failed,
      historicalBangers: historicalBangers.failed,
    },
  }
}
