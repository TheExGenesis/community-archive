import 'server-only'
import { unstable_cache } from 'next/cache'
import {
  createPublicReadClient,
  publicDataConfig,
} from '@/lib/publicDataSource'
import { fetchPortalTrendSeries } from '@/lib/portal/analytics'
import {
  addDays,
  isTrendDate,
  toTrendStoryCard,
  trendStoryFromRow,
  type TrendStoryDay,
  type TrendStorySeries,
  type TrendStory,
  type TrendStoryRow,
} from './core'

const table = () => createPublicReadClient().from('trend_stories')

async function readDay(trendDate: string): Promise<TrendStory[]> {
  const { data, error } = await table()
    .select('*')
    .eq('trend_date', trendDate)
    .order('position', { ascending: true })
  if (error) throw new Error('Trend stories are temporarily unavailable')
  return ((data ?? []) as unknown as TrendStoryRow[]).map(trendStoryFromRow)
}

// Short cache: an opt-out deletes rows, and a long-lived copy must not revive it.
const cachedDay = unstable_cache(
  async (trendDate: string, _source: string) => readDay(trendDate),
  ['trend-stories-day-v1'],
  { revalidate: 300 },
)

export async function getTrendStoriesForDate(
  trendDate: string,
): Promise<TrendStory[]> {
  if (!isTrendDate(trendDate)) return []
  return cachedDay(trendDate, publicDataConfig().sourceId)
}

/**
 * Homepage use: the stories for this trend window, or, until the nightly
 * job writes them (the window turns over at 00:00 UTC, the job runs at
 * 07:30), the newest day from the past week. The chips match stories by
 * term, so a term that is no longer trending simply stays a search link.
 * Never lets a story read failure break the trending row.
 */
export async function getTrendStoriesForDateSafe(trendDate: string | null) {
  if (!trendDate || !isTrendDate(trendDate)) return []
  try {
    const earliest = addDays(trendDate, -7)
    const day = (await getTrendStoryDates()).find(
      (date) => date <= trendDate && date >= earliest,
    )
    return day ? await getTrendStoriesForDate(day) : []
  } catch {
    return []
  }
}

export async function getTrendStory(trendDate: string, slug: string) {
  const stories = await getTrendStoriesForDate(trendDate)
  return {
    story: stories.find((story) => story.slug === slug) ?? null,
    stories,
  }
}

/** Newest first. Each day has at most ~6 rows, so 600 rows ≈ 100 days. */
const cachedDates = unstable_cache(
  async (_source: string): Promise<string[]> => {
    const { data, error } = await table()
      .select('trend_date')
      .order('trend_date', { ascending: false })
      .limit(600)
    if (error) throw new Error('Trend stories are temporarily unavailable')
    return Array.from(new Set((data ?? []).map((row) => row.trend_date)))
  },
  ['trend-stories-dates-v1'],
  { revalidate: 300 },
)

export async function getTrendStoryDates(): Promise<string[]> {
  return cachedDates(publicDataConfig().sourceId)
}

/** The newest `days` story days, newest first, for the Trends explorer. */
export async function getRecentTrendStoryDaysSafe(
  days = 14,
): Promise<TrendStoryDay[]> {
  try {
    const dates = (await getTrendStoryDates()).slice(0, days)
    const stories = await Promise.all(dates.map(getTrendStoriesForDate))
    return dates
      .map((date, index) => ({
        date,
        stories: stories[index].map(toTrendStoryCard),
      }))
      .filter((day) => day.stories.length)
  } catch {
    return []
  }
}

// Daily series for a story's terms. An hour of staleness is fine: the chart
// shows the run-up and aftermath, not a live count.
const cachedSeries = unstable_cache(
  async (terms: string[], _trendDate: string): Promise<TrendStorySeries> => {
    const body = await fetchPortalTrendSeries(
      terms,
      new Date(),
      undefined,
      'day',
    )
    return {
      days: body.buckets,
      series: body.series.map((item) => ({
        term: item.term,
        perBucket: item.perBucket,
        tweets: item.tweetsPerBucket,
      })),
    }
  },
  ['trend-stories-series-v1'],
  { revalidate: 3600 },
)

/** The story's terms over the days around its window; null if unavailable. */
export async function getTrendStorySeriesSafe(
  story: Pick<TrendStory, 'terms' | 'trendDate' | 'windowSince'>,
): Promise<TrendStorySeries | null> {
  try {
    const full = await cachedSeries(story.terms, story.trendDate)
    const from = addDays(story.windowSince, -28)
    const start = full.days.findIndex((day) => day >= from)
    if (start < 0) return null
    return {
      days: full.days.slice(start),
      series: full.series.map((item) => ({
        term: item.term,
        perBucket: item.perBucket.slice(start),
        tweets: item.tweets.slice(start),
      })),
    }
  } catch {
    return null
  }
}
