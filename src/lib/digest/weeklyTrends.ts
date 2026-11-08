import { fetchPortalTermDailySeries } from '@/lib/portal/analytics'
import type {
  WeeklyDigestContent,
  WeeklySourceEdition,
  WeeklyTrends,
} from './weekly'

const MAX_TERMS = 16
/** A story term with fewer matches than this over the window is not charted. */
export const WEEKLY_TREND_MIN_TWEETS = 5

const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

/**
 * Freeze daily word-trend counts for the story terms and the week's daily
 * rising/falling terms, over the week before and the week itself. Trends are
 * decoration: a failed read leaves the edition without them.
 */
export async function snapshotWeeklyTrends(
  content: WeeklyDigestContent,
  editions: WeeklySourceEdition[],
  fetchSeries = fetchPortalTermDailySeries,
  log: (message: string, error: unknown) => void = (message, error) =>
    console.warn(message, error),
): Promise<WeeklyDigestContent> {
  const weekTerms = Array.from(
    new Set(
      editions.flatMap(({ content: daily }) =>
        (daily.trends?.terms ?? []).map(({ term }) => term.toLowerCase()),
      ),
    ),
  )
  const storyTerms = content.stories.flatMap((story) => story.trendTerms)
  const terms = Array.from(new Set([...storyTerms, ...weekTerms])).slice(
    0,
    MAX_TERMS,
  )
  if (terms.length === 0) return content
  try {
    const { days, series } = await fetchSeries(
      terms,
      shift(content.weekStart, -7),
      content.weekEnd,
    )
    const charted = series.filter(
      ({ term, tweets }) =>
        weekTerms.includes(term) ||
        tweets.reduce((sum, count) => sum + count, 0) >=
          WEEKLY_TREND_MIN_TWEETS,
    )
    const trends: WeeklyTrends = {
      days,
      series: charted,
      weekTerms: weekTerms.filter((term) =>
        charted.some((item) => item.term === term),
      ),
    }
    return { ...content, trends }
  } catch (error) {
    log('Weekly trend snapshot failed; publishing without trends', error)
    return content
  }
}
