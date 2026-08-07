import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import {
  PortalData,
  PortalStats,
  PortalTrends,
  PortalTweet,
  PortalWeather,
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
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++
      results[i] = await jobs[i]()
    }
  })
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Daily-cached heavy aggregates (trends + weather inputs)
// ---------------------------------------------------------------------------

interface DailyAggregates {
  trends: PortalTrends
  ironyPer1k: number
  canonPer1k: number
  dailyStreamAvg14: number
  firstYear: number
}

async function computeDailyAggregates(): Promise<DailyAggregates> {
  const supabase = getPortalClient()
  const currentYear = new Date().getUTCFullYear()
  const years: number[] = []
  for (let y = FIRST_TREND_YEAR; y <= currentYear; y++) years.push(y)

  // Yearly totals (planned counts: fast, accurate enough for normalization).
  const yearlyTotals = await runBatched(
    years.map((y) => () =>
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
      years.map((y) => () =>
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

  // Weather instrument inputs.
  const [last7Total, ironyCount, canonCount, ...dailyStream] = await runBatched([
    () => countTweets(supabase, { from: from7 }),
    () => countTweets(supabase, { term: 'lol', from: from7 }),
    () => countTweets(supabase, { from: from7, minFavorites: 100 }),
    ...Array.from({ length: 14 }, (_, i) => () =>
      countTweets(supabase, {
        from: isoDaysAgo(i + 1).slice(0, 10),
        to: isoDaysAgo(i).slice(0, 10),
        streamedOnly: true,
      }),
    ),
  ])
  const safeTotal = Math.max(last7Total, 1)

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
    ironyPer1k: (ironyCount / safeTotal) * 1000,
    canonPer1k: (canonCount / safeTotal) * 1000,
    dailyStreamAvg14:
      dailyStream.reduce((a, b) => a + b, 0) / Math.max(dailyStream.length, 1),
    firstYear,
  }
}

const getDailyAggregates = unstable_cache(
  computeDailyAggregates,
  ['portal-daily-aggregates-v1'],
  { revalidate: 86400 },
)

// ---------------------------------------------------------------------------
// Weather derivation (deterministic per day, driven by real metrics)
// ---------------------------------------------------------------------------

/** Small deterministic PRNG seeded by the UTC date, so the report only changes daily. */
const daySeeded = (offset = 0) => {
  const d = new Date()
  let seed =
    d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  seed = (seed + offset * 137) % 2147483647
  let x = seed
  return () => {
    x = (x * 48271) % 2147483647
    return x / 2147483647
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(v)))

function deriveWeather(
  agg: DailyAggregates,
  streamedToday: number,
  streamedLast24h: number,
): PortalWeather {
  const weekly = agg.trends.weekly
  const byVolume = [...weekly].sort((a, b) => b.last7 - a.last7)
  const withDelta = weekly.filter((w) => w.deltaPct !== null && w.prev7 >= 5)
  const risers = [...withDelta].sort((a, b) => b.deltaPct! - a.deltaPct!)
  const fallers = [...withDelta].sort((a, b) => a.deltaPct! - b.deltaPct!)
  const topTerm = byVolume[0]
  const topRiser = risers[0]
  const topFaller = fallers[0]

  // "Gusts": peak-ish hourly rate for the loudest term (2× its weekly average).
  const mentionsPerHour = Math.max(
    1,
    Math.round(topTerm ? (topTerm.last7 / (7 * 24)) * 2 : 1),
  )

  // Discourse pressure: rolling 24h streamed volume vs the 14-day daily average.
  const pressureRatio =
    agg.dailyStreamAvg14 > 0 ? streamedLast24h / agg.dailyStreamAvg14 : 1
  const pressure = clamp(pressureRatio * 50, 5, 98)
  const pressureTag =
    pressure >= 75
      ? ['Extreme', '#f87171']
      : pressure >= 55
        ? ['High', '#f87171']
        : pressure >= 40
          ? ['Moderate', '#fbbf24']
          : ['Calm', '#3b82f6']

  // Irony saturation: share of the week's tweets carrying irony markers.
  const irony = clamp(agg.ironyPer1k * 4, 5, 98)
  const ironyTag =
    irony >= 60
      ? ['Elevated', '#fbbf24']
      : irony >= 35
        ? ['Moderate', '#3b82f6']
        : ['Low', '#a7a7b4']

  // Novelty inflow: how many watchlist terms are moving up sharply.
  const sharpRisers = withDelta.filter((w) => (w.deltaPct ?? 0) >= 25).length
  const novelty = clamp(
    sharpRisers * 14 + Math.min(topRiser?.deltaPct ?? 0, 100) / 5,
    5,
    98,
  )
  const noveltyTag =
    novelty >= 60
      ? ['Surging', '#2acf80']
      : novelty >= 35
        ? ['Moderate', '#3b82f6']
        : ['Slow', '#a7a7b4']

  // Canon formation: share of the week's tweets clearing 100 likes.
  const canon = clamp(agg.canonPer1k * 0.8, 3, 98)
  const canonTag =
    canon >= 60
      ? ['Active', '#2acf80']
      : canon >= 30
        ? ['Steady', '#3b82f6']
        : ['Slow', '#a7a7b4']

  const fmtDelta = (d: number | null | undefined) =>
    d === null || d === undefined ? '±0%' : `${d >= 0 ? '+' : '−'}${Math.abs(d)}%`

  const gauges = [
    {
      key: 'pressure',
      label: 'Discourse pressure',
      value: pressure,
      tag: pressureTag[0],
      color: pressureTag[1],
      note: `${streamedLast24h.toLocaleString('en-US')} tweets streamed in the last 24h vs a ${Math.round(agg.dailyStreamAvg14).toLocaleString('en-US')}/day two-week norm.`,
    },
    {
      key: 'irony',
      label: 'Irony saturation',
      value: irony,
      tag: ironyTag[0],
      color: ironyTag[1],
      note: `${agg.ironyPer1k.toFixed(1)} per 1k tweets this week carry irony markers.`,
    },
    {
      key: 'novelty',
      label: 'Novelty inflow',
      value: novelty,
      tag: noveltyTag[0],
      color: noveltyTag[1],
      note: topRiser
        ? `${sharpRisers} tracked term${sharpRisers === 1 ? '' : 's'} rising sharply; “${topRiser.term}” leads at ${fmtDelta(topRiser.deltaPct)} w/w.`
        : 'No tracked terms moving sharply this week.',
    },
    {
      key: 'canon',
      label: 'Canon formation',
      value: canon,
      tag: canonTag[0],
      color: canonTag[1],
      note: `${agg.canonPer1k.toFixed(1)} per 1k tweets this week cleared 100 likes — candidates for the canon.`,
    },
  ]

  const headline = topTerm
    ? `${pressure >= 55 ? 'Heavy' : pressure >= 40 ? 'Steady' : 'Light'} ${topTerm.term} discourse, gusts to ${mentionsPerHour} mentions/hr`
    : 'Quiet timeline, light variable posting'

  const summary = `Irony saturation at ${irony}%. ${
    topRiser
      ? `A front of ${topRiser.term}-posting is building (${fmtDelta(topRiser.deltaPct)} week over week).`
      : 'No major fronts approaching.'
  }`

  const synopsis = `${
    topTerm
      ? `“${topTerm.term}” remains the dominant system on the timeline with ${topTerm.last7.toLocaleString('en-US')} mentions over seven days. `
      : ''
  }Streaming volume is running at ${Math.round(pressureRatio * 100)}% of the two-week norm, with ${streamedToday.toLocaleString('en-US')} tweets archived so far today. Irony saturation holds at ${irony}% — expect takes to arrive pre-hedged.`

  const outlookText = `${
    topRiser
      ? `A slow-moving front of ${topRiser.term} talk should strengthen through the week (${fmtDelta(topRiser.deltaPct)} w/w). `
      : ''
  }${
    topFaller && (topFaller.deltaPct ?? 0) < 0
      ? `${topFaller.term[0].toUpperCase() + topFaller.term.slice(1)} mentions keep falling (${fmtDelta(topFaller.deltaPct)}); its earlier highs now read as a historical climate event rather than weather.`
      : 'No tracked systems are dissipating at speed.'
  }`

  const advisoriesText = `Canon-formation rate is ${canon >= 30 ? 'steady' : 'slow'} (${canon}/100) — ${
    canon >= 30
      ? 'several tweets posted this week are on track to be remembered.'
      : 'few tweets posted this week are expected to be remembered.'
  }`

  const advisories = [
    topTerm && {
      title: `Quote-tweet swell — ${topTerm.term}`,
      body: `Highest-volume system this week at ${topTerm.last7.toLocaleString('en-US')} mentions. QT layers of 3–5 expected nearby; new accounts advised to stay in replies.`,
    },
    topRiser && {
      title: `Ratio watch — takes about ${topRiser.term}`,
      body: `Mentions up ${fmtDelta(topRiser.deltaPct)} week over week. Elevated ratio risk for skeptical takes; hedge or delay.`,
    },
    topFaller && (topFaller.deltaPct ?? 0) < 0
      ? {
          title: `Semantic drift — “${topFaller.term}”`,
          body: `Mentions down ${fmtDelta(topFaller.deltaPct)} this week. Term may be entering its nostalgic phase; meaning no longer guaranteed.`,
        }
      : null,
  ].filter(Boolean) as { title: string; body: string }[]

  // Deterministic 5-day outlook, seeded by the date and shaped by real metrics.
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const conditions: [string, (t: string) => string][] = [
    ['⛈', (t) => `Heavy ${t} discourse; QT swells likely`],
    ['🌧', () => `Discourse pressure easing; scattered sincerity in the morning`],
    ['🌫', (t) => `${t[0].toUpperCase() + t.slice(1)} front makes landfall; visibility on object-level claims poor`],
    ['⛅', () => `Clearing; conditions favorable for longform and field notes`],
    ['☀', () => `Quiet timeline; good day to upload an archive`],
  ]
  const rand = daySeeded(3)
  const outlook = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(Date.now() + (i + 1) * 86400_000)
    const bias = i === 0 && pressure >= 55 ? 0 : Math.floor(rand() * conditions.length)
    const [icon, textFn] = conditions[bias]
    const term =
      (i % 2 === 0 ? topTerm?.term : topRiser?.term) ?? topTerm?.term ?? 'ambient'
    return { day: days[date.getUTCDay()], icon, text: textFn(term) }
  })

  return {
    headline,
    summary,
    synopsis,
    outlookText,
    advisoriesText,
    gauges,
    advisories,
    outlook,
    issuedAt: new Date().toISOString(),
  }
}

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

async function getPortalStats(
  firstYear: number,
): Promise<PortalStats & { streamedLast24h: number }> {
  const supabase = getPortalClient()
  const [
    summaryResult,
    directoryResult,
    streamedToday,
    streamedLast24h,
    joinedThisWeek,
  ] = await Promise.all([
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
    countTweets(getPortalClient(), {
      from: isoDaysAgo(1),
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
    streamedLast24h,
    joinedThisWeek: joinedThisWeek.count ?? 0,
    firstYear,
    currentYear: new Date().getUTCFullYear(),
    generatedAt: new Date().toISOString(),
  }
}

export async function getPortalData(): Promise<PortalData> {
  const agg = await getDailyAggregates()
  const [statsWithWindow, initialStream] = await Promise.all([
    getPortalStats(agg.firstYear),
    getPortalStream(30),
  ])
  const { streamedLast24h, ...stats } = statsWithWindow
  const weather = deriveWeather(agg, stats.streamedToday, streamedLast24h)
  return { stats, trends: agg.trends, weather, initialStream }
}
