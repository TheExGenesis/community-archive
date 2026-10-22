import {
  bentoRank,
  hasCover,
  shelfWeight,
  tweetTimes,
  type BentoItem,
} from './bento'
import type { ShelfItem } from './types'

/** The music view's order: what the member came back to most, or what they tweeted about last. */
export type MusicSort = 'most' | 'latest'

type MusicItem = BentoItem & Pick<ShelfItem, 'firstAt'>

/** Square sleeves at the top of the music view. */
export const SLEEVE_LIMIT = 6
// Three tweets, or fewer with a loved or recommended mark; fewer than three sleeves read as a gap.
const SLEEVE_MIN_WEIGHT = 3
const SLEEVE_MIN_COUNT = 3

const lastTweet = (item: MusicItem) => Math.max(...tweetTimes(item))

const byRank = (a: MusicItem, b: MusicItem) =>
  bentoRank(b) - bentoRank(a) ||
  lastTweet(b) - lastTweet(a) ||
  a.workKey.localeCompare(b.workKey)

/**
 * The works a member returned to most, as large sleeves: weighted by tweets
 * and marks, a cover breaking ties. None when too few qualify to fill a row.
 */
export function musicSleeves<T extends MusicItem>(
  items: T[],
  limit = SLEEVE_LIMIT,
): T[] {
  const pool = items
    .filter(
      (item) => !item.needsTitle && shelfWeight(item) >= SLEEVE_MIN_WEIGHT,
    )
    .sort(
      (a, b) =>
        bentoRank(b) +
          (hasCover(b) ? 0.5 : 0) -
          (bentoRank(a) + (hasCover(a) ? 0.5 : 0)) || byRank(a, b),
    )
    .slice(0, limit)
  return pool.length >= SLEEVE_MIN_COUNT ? pool : []
}

/** A medium view's works, most tweeted first or latest first. */
export function sortWorks<T extends MusicItem>(
  items: T[],
  sort: MusicSort,
): T[] {
  return sort === 'latest'
    ? [...items].sort((a, b) => lastTweet(b) - lastTweet(a) || byRank(a, b))
    : [...items].sort(byRank)
}

/** Everything that is not a sleeve, most tweeted first or latest first. */
export function musicTracks<T extends MusicItem>(
  items: T[],
  sleeves: T[],
  sort: MusicSort,
): T[] {
  return sortWorks(
    items.filter((item) => !sleeves.includes(item)),
    sort,
  )
}

/** The years the member tweeted about it: "2019", or "2016–2023". */
export function musicYears(
  item: Pick<ShelfItem, 'evidenceTweetIds' | 'firstAt' | 'lastAt'>,
) {
  const years = tweetTimes(item).map((t) => new Date(t).getUTCFullYear())
  const first = Math.min(...years)
  const last = Math.max(...years)
  return first === last ? String(first) : `${first}–${last}`
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(spotify\.com|spotify\.link)$/, 'Spotify'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
  [/^music\.apple\.com$/, 'Apple Music'],
]

/** Where the link plays, for a work with no artist: "YouTube", "Bandcamp". */
export function musicSource(url: string | null) {
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase()
    return SOURCES.find(([pattern]) => pattern.test(host))?.[1] ?? null
  } catch {
    return null
  }
}
