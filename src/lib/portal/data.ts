import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import {
  PortalData,
  PortalStats,
  PortalTrends,
  PortalTweet,
  TermSeries,
  TermWeek,
} from './types'

const FIRST_TREND_YEAR = 2019

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
const WATCHLIST = [
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

const getPortalClient = (): SupabaseClient<Database> => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'
  const url =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  })
}

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86400_000).toISOString()

const startOfTodayUTC = () => {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
}

/** Exact count of tweets matching an optional FTS term within a date range. */
async function countTweets(
  supabase: SupabaseClient<Database>,
  opts: {
    term?: string
    from?: string
    to?: string
    streamedOnly?: boolean
    minFavorites?: number
    countMode?: 'exact' | 'planned'
  },
): Promise<number> {
  let query = supabase
    .from('tweets')
    .select('tweet_id', { count: opts.countMode ?? 'exact', head: true })
  if (opts.term) {
    const type = opts.term.includes(' ') ? 'phrase' : 'plain'
    query = query.textSearch('fts', opts.term, { type })
  }
  if (opts.from) query = query.gte('created_at', opts.from)
  if (opts.to) query = query.lt('created_at', opts.to)
  if (opts.streamedOnly) query = query.is('archive_upload_id', null)
  if (opts.minFavorites) query = query.gte('favorite_count', opts.minFavorites)
  const { count, error } = await query
  if (error) {
    console.error('Portal count query failed:', opts, error)
    return 0
  }
  return count ?? 0
}

/** Run count jobs with limited concurrency so we don't hammer the DB. */
async function runBatched<T>(
  jobs: (() => Promise<T>)[],
  concurrency = 6,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const i = next++
        results[i] = await jobs[i]()
      }
    },
  )
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Daily-cached heavy aggregates (trends + weather inputs)
// ---------------------------------------------------------------------------

interface DailyAggregates {
  trends: PortalTrends
  firstYear: number
}

async function computeDailyAggregates(): Promise<DailyAggregates> {
  const supabase = getPortalClient()
  const currentYear = new Date().getUTCFullYear()
  const years: number[] = []
  for (let y = FIRST_TREND_YEAR; y <= currentYear; y++) years.push(y)

  // Yearly totals (planned counts: fast, accurate enough for normalization).
  const yearlyTotals = await runBatched(
    years.map(
      (y) => () =>
        countTweets(supabase, {
          from: `${y}-01-01`,
          to: `${y + 1}-01-01`,
          countMode: 'planned',
        }),
    ),
  )

  // Per-term yearly counts, normalized per 100k tweets.
  const seriesCounts = await runBatched(
    CHART_TERMS.flatMap(({ term }) =>
      years.map(
        (y) => () =>
          countTweets(supabase, {
            term,
            from: `${y}-01-01`,
            to: `${y + 1}-01-01`,
          }),
      ),
    ),
  )
  const series: TermSeries[] = CHART_TERMS.map(({ term, color }, ti) => ({
    term,
    color,
    perYear: years.map((_, yi) => {
      const total = yearlyTotals[yi] || 1
      return (seriesCounts[ti * years.length + yi] / total) * 100_000
    }),
  }))

  // Weekly deltas for the watchlist.
  const from14 = isoDaysAgo(14)
  const from7 = isoDaysAgo(7)
  const weeklyCounts = await runBatched(
    WATCHLIST.flatMap((term) => [
      () => countTweets(supabase, { term, from: from7 }),
      () => countTweets(supabase, { term, from: from14, to: from7 }),
    ]),
  )
  const weekly: TermWeek[] = WATCHLIST.map((term, i) => {
    const last7 = weeklyCounts[i * 2]
    const prev7 = weeklyCounts[i * 2 + 1]
    return {
      term,
      last7,
      prev7,
      deltaPct: prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null,
    }
  })

  // First year with a meaningful number of tweets (skip junk timestamps).
  const { data: firstRows } = await supabase
    .from('tweets')
    .select('created_at')
    .gte('created_at', '2006-01-01')
    .order('created_at', { ascending: true })
    .limit(1)
  const firstYear = firstRows?.[0]?.created_at
    ? new Date(firstRows[0].created_at).getUTCFullYear()
    : 2008

  return {
    trends: {
      years,
      series,
      weekly,
      computedAt: new Date().toISOString(),
    },
    firstYear,
  }
}

const getDailyAggregates = unstable_cache(
  computeDailyAggregates,
  ['portal-daily-aggregates-v1'],
  { revalidate: 86400 },
)

// ---------------------------------------------------------------------------
// Live-ish stats + stream (cached at the page level, minutes not days)
// ---------------------------------------------------------------------------

export async function getPortalStream(limit = 30): Promise<PortalTweet[]> {
  const supabase = getPortalClient()
  const { data, error } = await supabase
    .from('tweets')
    .select(
      `
      tweet_id,
      account_id,
      created_at,
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
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Portal stream query failed:', error)
    return []
  }

  const tweets = data ?? []
  const accountOf = (t: any) =>
    Array.isArray(t.account) ? t.account[0] : t.account

  // Avatars in one extra round-trip.
  const accountIds = Array.from(
    new Set(tweets.map((t: any) => t.account_id).filter(Boolean)),
  )
  const avatarMap = new Map<string, string>()
  if (accountIds.length > 0) {
    const { data: profiles } = await supabase
      .from('all_profile')
      .select('account_id, avatar_media_url')
      .in('account_id', accountIds)
      .order('archive_upload_id', { ascending: false })
    profiles?.forEach((p: any) => {
      if (p.avatar_media_url && !avatarMap.has(p.account_id)) {
        avatarMap.set(p.account_id, p.avatar_media_url)
      }
    })
  }

  return tweets.map((t: any) => {
    const account = accountOf(t)
    return {
      id: t.tweet_id,
      username: account?.username ?? 'unknown',
      name: account?.account_display_name ?? account?.username ?? 'Unknown',
      avatar: avatarMap.get(t.account_id) ?? null,
      text: t.full_text ?? '',
      createdAt: t.created_at,
      likes: t.favorite_count ?? 0,
      rts: t.retweet_count ?? 0,
    }
  })
}

async function getPortalStats(firstYear: number): Promise<PortalStats> {
  const supabase = getPortalClient()
  const [summaryResult, directoryResult, streamedToday, joinedThisWeek] =
    await Promise.all([
      supabase
        .from('global_activity_summary')
        .select('total_tweets, total_likes')
        .single(),
      supabase
        .from('user_directory')
        .select('directory_id', { count: 'exact', head: true }),
      countTweets(getPortalClient(), {
        from: startOfTodayUTC(),
        streamedOnly: true,
      }),
      supabase
        .from('archive_upload')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', isoDaysAgo(7)),
    ])

  if (summaryResult.error) {
    console.error('Portal stats summary failed:', summaryResult.error)
  }

  return {
    totalTweets: summaryResult.data?.total_tweets ?? 0,
    totalLikes: summaryResult.data?.total_likes ?? 0,
    accountCount: directoryResult.count ?? 0,
    streamedToday,
    joinedThisWeek: joinedThisWeek.count ?? 0,
    firstYear,
    currentYear: new Date().getUTCFullYear(),
    generatedAt: new Date().toISOString(),
  }
}

// The homepage renders dynamically (auth cookies), so cache the lighter
// queries here: stats for 5 minutes, the initial stream for 1 minute.
const getCachedStats = unstable_cache(
  (firstYear: number) => getPortalStats(firstYear),
  ['portal-stats-v1'],
  { revalidate: 300 },
)
const getCachedInitialStream = unstable_cache(
  () => getPortalStream(30),
  ['portal-initial-stream-v1'],
  { revalidate: 60 },
)

export async function getPortalData(): Promise<PortalData> {
  const agg = await getDailyAggregates()
  const [stats, initialStream] = await Promise.all([
    getCachedStats(agg.firstYear),
    getCachedInitialStream(),
  ])
  return { stats, trends: agg.trends, initialStream }
}
