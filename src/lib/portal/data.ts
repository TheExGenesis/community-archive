import 'server-only'
import { unstable_cache } from 'next/cache'
import { clickHouseAnalyticsGatewayBaseUrl } from '@/lib/clickhouseGateway'
import { fetchPortalLiveAnalytics, fetchPortalTrends } from './analytics'
import type { PortalLiveAnalytics } from './analytics'
import { getResearchPosts } from './research'
import type {
  PortalData,
  PortalStats,
  PortalTrends,
  PortalTweet,
} from './types'

interface PortalReadConfig {
  url: string
  anonKey: string
  sourceId: string
}

export interface PortalStreamCursor {
  observedAt: string
  id: string
}

interface PortalCorpusSnapshot {
  trends: PortalTrends
  firstYear: number
  currentYear: number
}

const PORTAL_READ_TIMEOUT_MS = 10_000

type PortalStatsSnapshot = PortalLiveAnalytics & {
  totalLikes: number
  accountCount: number
  joinedThisWeek: number
}

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
  return `portal-v4:${environment}:${analyticsSource}:${portalRead.sourceId}`
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

function exactCount(response: Response, label: string): number {
  const contentRange = response.headers.get('content-range')
  const countText = contentRange?.split('/').at(-1)
  const count = countText ? Number(countText) : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Portal ${label} count returned an invalid response`)
  }
  return count
}

/** Membership and liked-tweet totals whose canonical source is production. */
export async function fetchPortalProductionTotals(): Promise<{
  accountCount: number
  totalLikes: number
}> {
  const [membersResponse, summaryRows] = await Promise.all([
    portalRestRequest(
      'user_directory',
      new URLSearchParams({ select: 'directory_id' }),
      { method: 'HEAD', prefer: 'count=exact' },
    ),
    portalRestRows<{ total_likes: number }>(
      'global_activity_summary',
      new URLSearchParams({ select: 'total_likes', limit: '1' }),
    ),
  ])
  const totalLikes = Number(summaryRows[0]?.total_likes)
  if (!Number.isSafeInteger(totalLikes) || totalLikes < 0) {
    throw new Error('Portal liked-tweet total returned an invalid response')
  }
  return {
    accountCount: exactCount(membersResponse, 'member'),
    totalLikes,
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function validatedCursor(cursor: PortalStreamCursor): PortalStreamCursor {
  const observedAt = new Date(cursor.observedAt)
  if (Number.isNaN(observedAt.getTime()) || !/^\d{1,32}$/.test(cursor.id)) {
    throw new Error('Invalid portal stream cursor')
  }
  return { observedAt: observedAt.toISOString(), id: cursor.id }
}

export async function getPortalStream(
  limit = 30,
  cursor?: PortalStreamCursor,
): Promise<PortalTweet[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const after = cursor ? validatedCursor(cursor) : null
  const params = new URLSearchParams({
    select:
      'tweet_id,account_id,created_at,updated_at,full_text,retweet_count,favorite_count,account:all_account!inner(username,account_display_name)',
    archive_upload_id: 'is.null',
    reply_to_tweet_id: 'is.null',
    full_text: 'not.ilike.RT @%',
    order: `${after ? 'updated_at.asc' : 'updated_at.desc'},${after ? 'tweet_id.asc' : 'tweet_id.desc'}`,
    limit: String(safeLimit),
  })

  if (after) {
    params.set(
      'or',
      `(updated_at.gt.${after.observedAt},and(updated_at.eq.${after.observedAt},tweet_id.gt.${after.id}))`,
    )
  }

  const data = await portalRestRows<any>('tweets', params)
  return toPortalTweets(data)
}

/** Map raw tweet rows to portal tweets and attach the newest known avatar. */
async function toPortalTweets(tweets: any[]): Promise<PortalTweet[]> {
  const accountOf = (tweet: any) =>
    Array.isArray(tweet.account) ? tweet.account[0] : tweet.account
  const accountIds = Array.from(
    new Set(tweets.map((tweet: any) => tweet.account_id).filter(Boolean)),
  )
  const avatarMap = new Map<string, string>()

  if (accountIds.length > 0) {
    try {
      const profiles = await portalRestRows<any>(
        'all_profile',
        new URLSearchParams({
          select: 'account_id,avatar_media_url',
          account_id: `in.(${accountIds.join(',')})`,
          order: 'archive_upload_id.desc',
        }),
      )
      profiles.forEach((profile: any) => {
        if (profile.avatar_media_url && !avatarMap.has(profile.account_id)) {
          avatarMap.set(profile.account_id, profile.avatar_media_url)
        }
      })
    } catch (error) {
      console.error('Portal avatar query failed:', error)
    }
  }

  return tweets.map((tweet: any) => {
    const account = accountOf(tweet)
    return {
      id: tweet.tweet_id,
      username: account?.username ?? 'unknown',
      name: account?.account_display_name ?? account?.username ?? 'Unknown',
      avatar: avatarMap.get(tweet.account_id) ?? null,
      text: tweet.full_text ?? '',
      observedAt: tweet.updated_at ?? tweet.created_at,
      createdAt: tweet.created_at,
      likes: tweet.favorite_count ?? 0,
      rts: tweet.retweet_count ?? 0,
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
        distance || right.likes - left.likes || left.id.localeCompare(right.id)
      )
    })
    .slice(0, Math.max(1, poolSize))

  if (candidates.length < 2) return candidates
  const day = now.toISOString().slice(0, 10)
  const selectedIndex = stableHash(day) % candidates.length
  const selected = candidates[selectedIndex]
  return [selected, ...candidates.filter((_, index) => index !== selectedIndex)]
}

/** Calendar-matched bangers from members' own production archives. */
async function fetchDailyBangers(now = new Date()): Promise<PortalTweet[]> {
  const data = await portalRestRows<any>(
    'tweets',
    new URLSearchParams({
      select:
        'tweet_id,account_id,created_at,updated_at,full_text,retweet_count,favorite_count,account:all_account!inner(username,account_display_name)',
      archive_upload_id: 'not.is.null',
      reply_to_tweet_id: 'is.null',
      full_text: 'not.ilike.RT @%',
      order: 'favorite_count.desc',
      limit: '500',
    }),
  )
  const textful = data.filter((tweet: any) => {
    const text = (tweet.full_text ?? '').replace(/https?:\/\/\S+/g, '').trim()
    return text.length >= 30
  })
  const ranked = selectDailyBangers(
    textful.map(
      (tweet: any): PortalTweet => ({
        id: tweet.tweet_id,
        username: '',
        name: '',
        avatar: null,
        text: tweet.full_text ?? '',
        observedAt: tweet.updated_at ?? tweet.created_at,
        createdAt: tweet.created_at,
        likes: tweet.favorite_count ?? 0,
        rts: tweet.retweet_count ?? 0,
      }),
    ),
    now,
  )
  const rowsById = new Map(data.map((tweet: any) => [tweet.tweet_id, tweet]))
  return toPortalTweets(
    ranked
      .map((tweet) => rowsById.get(tweet.id))
      .filter((tweet): tweet is any => Boolean(tweet)),
  )
}

async function fetchCorpusRange(): Promise<{
  firstYear: number
  currentYear: number
}> {
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

async function computePortalCorpusSnapshot(): Promise<PortalCorpusSnapshot> {
  const [trends, range] = await Promise.all([
    fetchPortalTrends(),
    fetchCorpusRange(),
  ])
  return { trends, ...range }
}

async function computePortalStatsSnapshot(): Promise<PortalStatsSnapshot> {
  const [analytics, productionTotals, joinedThisWeekResponse] =
    await Promise.all([
      fetchPortalLiveAnalytics(),
      fetchPortalProductionTotals(),
      portalRestRequest(
        'archive_upload',
        new URLSearchParams({
          select: 'id',
          created_at: `gte.${isoDaysAgo(7)}`,
        }),
        { method: 'HEAD', prefer: 'count=exact' },
      ),
    ])
  return {
    ...analytics,
    ...productionTotals,
    joinedThisWeek: exactCount(joinedThisWeekResponse, 'upload'),
  }
}

// Arguments participate in the cache key, keeping staging/prod sources and
// deployment environments isolated even when the Data Cache survives deploys.
const getCachedCorpusSnapshot = unstable_cache(
  async (_sourceKey: string) => computePortalCorpusSnapshot(),
  ['portal-corpus-snapshot-v3'],
  { revalidate: 86_400 },
)
const getCachedStatsSnapshot = unstable_cache(
  async (_sourceKey: string) => computePortalStatsSnapshot(),
  ['portal-stats-snapshot-v4'],
  { revalidate: 300 },
)
const getCachedInitialStream = unstable_cache(
  async (_sourceKey: string) => getPortalStream(30),
  ['portal-initial-stream-v3'],
  { revalidate: 60 },
)
const getCachedBangers = unstable_cache(
  async (_sourceKey: string, day: string) =>
    fetchDailyBangers(new Date(`${day}T12:00:00.000Z`)),
  ['portal-bangers-v4'],
  { revalidate: 86_400 },
)

export async function getPortalData(
  view: 'home' | 'stream' = 'home',
): Promise<PortalData> {
  const sourceKey = portalDataSourceKey()
  const today = new Date().toISOString().slice(0, 10)
  const [corpus, live, initialStream, research, bangers] = await Promise.all([
    getCachedCorpusSnapshot(sourceKey),
    getCachedStatsSnapshot(sourceKey),
    getCachedInitialStream(sourceKey),
    view === 'home' ? getResearchPosts() : Promise.resolve([]),
    view === 'home' ? getCachedBangers(sourceKey, today) : Promise.resolve([]),
  ])
  const stats: PortalStats = {
    totalTweets: live.totalTweets,
    totalLikes: live.totalLikes,
    accountCount: live.accountCount,
    streamedToday: live.streamedToday,
    joinedThisWeek: live.joinedThisWeek,
    firstYear: corpus.firstYear,
    currentYear: corpus.currentYear,
    generatedAt: live.generatedAt,
  }
  return {
    stats,
    trends: corpus.trends,
    initialStream,
    research,
    bangers,
  }
}
