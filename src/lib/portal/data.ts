import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Database } from '@/database-types'
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

type PortalStatsSnapshot = PortalLiveAnalytics & {
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
  return `portal-v3:${environment}:${analyticsSource}:${portalRead.sourceId}`
}

const getPortalClient = (): SupabaseClient<Database> => {
  const { url, anonKey } = resolvePortalReadConfig()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  })
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
  const supabase = getPortalClient()
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const after = cursor ? validatedCursor(cursor) : null
  let query = supabase
    .from('tweets')
    .select(
      `
      tweet_id,
      account_id,
      created_at,
      updated_at,
      full_text,
      retweet_count,
      favorite_count,
      account:all_account!inner (
        username,
        account_display_name
      )
    `,
    )
    .is('archive_upload_id', null)
    .is('reply_to_tweet_id', null)
    .not('full_text', 'ilike', 'RT @%')

  if (after) {
    query = query.or(
      `updated_at.gt.${after.observedAt},and(updated_at.eq.${after.observedAt},tweet_id.gt.${after.id})`,
    )
  }

  const { data, error } = await query
    .order('updated_at', {
      ascending: Boolean(after),
      nullsFirst: false,
    })
    .order('tweet_id', { ascending: Boolean(after) })
    .limit(safeLimit)

  if (error) throw new Error(`Portal stream query failed: ${error.message}`)
  return toPortalTweets(supabase, data ?? [])
}

/** Map raw tweet rows to portal tweets and attach the newest known avatar. */
async function toPortalTweets(
  supabase: SupabaseClient<Database>,
  tweets: any[],
): Promise<PortalTweet[]> {
  const accountOf = (tweet: any) =>
    Array.isArray(tweet.account) ? tweet.account[0] : tweet.account
  const accountIds = Array.from(
    new Set(tweets.map((tweet: any) => tweet.account_id).filter(Boolean)),
  )
  const avatarMap = new Map<string, string>()

  if (accountIds.length > 0) {
    const { data: profiles, error } = await supabase
      .from('all_profile')
      .select('account_id, avatar_media_url')
      .in('account_id', accountIds)
      .order('archive_upload_id', { ascending: false })
    if (error) {
      console.error('Portal avatar query failed:', error)
    } else {
      profiles?.forEach((profile: any) => {
        if (profile.avatar_media_url && !avatarMap.has(profile.account_id)) {
          avatarMap.set(profile.account_id, profile.avatar_media_url)
        }
      })
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

/** Top-liked original tweets from members' own production archives. */
async function fetchTopBangers(limit = 30): Promise<PortalTweet[]> {
  const supabase = getPortalClient()
  const { data, error } = await supabase
    .from('tweets')
    .select(
      `
      tweet_id,
      account_id,
      created_at,
      updated_at,
      full_text,
      retweet_count,
      favorite_count,
      account:all_account!inner (
        username,
        account_display_name
      )
    `,
    )
    .not('archive_upload_id', 'is', null)
    .is('reply_to_tweet_id', null)
    .not('full_text', 'ilike', 'RT @%')
    .order('favorite_count', { ascending: false })
    .limit(80)

  if (error) throw new Error(`Portal bangers query failed: ${error.message}`)
  const textful = (data ?? []).filter((tweet: any) => {
    const text = (tweet.full_text ?? '').replace(/https?:\/\/\S+/g, '').trim()
    return text.length >= 30
  })
  const mapped = await toPortalTweets(supabase, textful)
  return mapped.slice(0, limit)
}

async function fetchCorpusRange(): Promise<{
  firstYear: number
  currentYear: number
}> {
  const supabase = getPortalClient()
  const base = () =>
    supabase
      .from('tweets')
      .select('created_at')
      .gte('created_at', '2006-01-01')
      .limit(1)
  const [firstResult, latestResult] = await Promise.all([
    base().order('created_at', { ascending: true }),
    base().order('created_at', { ascending: false }),
  ])
  if (firstResult.error) {
    throw new Error(
      `Portal corpus start query failed: ${firstResult.error.message}`,
    )
  }
  if (latestResult.error) {
    throw new Error(
      `Portal corpus end query failed: ${latestResult.error.message}`,
    )
  }
  const first = firstResult.data?.[0]?.created_at
  const latest = latestResult.data?.[0]?.created_at
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
  const supabase = getPortalClient()
  const [analytics, joinedThisWeek] = await Promise.all([
    fetchPortalLiveAnalytics(),
    supabase
      .from('archive_upload')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', isoDaysAgo(7)),
  ])
  if (joinedThisWeek.error) {
    throw new Error(
      `Portal upload count failed: ${joinedThisWeek.error.message}`,
    )
  }
  return { ...analytics, joinedThisWeek: joinedThisWeek.count ?? 0 }
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
  ['portal-stats-snapshot-v3'],
  { revalidate: 300 },
)
const getCachedInitialStream = unstable_cache(
  async (_sourceKey: string) => getPortalStream(30),
  ['portal-initial-stream-v3'],
  { revalidate: 60 },
)
const getCachedBangers = unstable_cache(
  async (_sourceKey: string) => fetchTopBangers(30),
  ['portal-bangers-v3'],
  { revalidate: 86_400 },
)

export async function getPortalData(
  view: 'home' | 'stream' = 'home',
): Promise<PortalData> {
  const sourceKey = portalDataSourceKey()
  const [corpus, live, initialStream, research, bangers] = await Promise.all([
    getCachedCorpusSnapshot(sourceKey),
    getCachedStatsSnapshot(sourceKey),
    getCachedInitialStream(sourceKey),
    view === 'home' ? getResearchPosts() : Promise.resolve([]),
    view === 'home' ? getCachedBangers(sourceKey) : Promise.resolve([]),
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
