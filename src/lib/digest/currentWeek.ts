import { getPublishedDigest, getPublishedDigestsBetween } from './data'
import type { DigestEdition } from './types'
import { weekDates, weekStartFor } from './weekly'
import { getPublishedWeeklyDigest } from './weeklyData'

export interface CurrentWeek {
  weekStart: string
  /** Monday to Sunday. */
  dates: string[]
  /** The week's published daily editions, oldest first. */
  editions: DigestEdition[]
}

/**
 * Monday of the week the newest published daily edition belongs to, while that
 * week has no published weekly edition yet; otherwise null. Following the
 * newest daily (not the clock) keeps a finished week readable until its weekly
 * edition is out.
 */
export async function inProgressWeekStart(): Promise<string | null> {
  const latest = await getPublishedDigest()
  if (!latest || latest.isPreview) return null
  const weekStart = weekStartFor(latest.digestDate)
  return (await getPublishedWeeklyDigest(weekStart)) ? null : weekStart
}

/** The in-progress week and its daily editions so far, if there is one. */
export async function getCurrentWeek(): Promise<CurrentWeek | null> {
  const weekStart = await inProgressWeekStart()
  if (!weekStart) return null
  const dates = weekDates(weekStart)
  const editions = await getPublishedDigestsBetween(dates[0], dates[6])
  return editions.length > 0 ? { weekStart, dates, editions } : null
}
