import type { PortalTweet } from './types'

export type TrendEvidenceSort = 'newest' | 'oldest'

export interface TrendEvidenceRange {
  /** Inclusive UTC date in YYYY-MM-DD form. */
  since: string
  /** Exclusive UTC date in YYYY-MM-DD form. */
  until: string
}

export interface TrendEvidenceCacheEntry {
  term: string
  range: TrendEvidenceRange | null
  sort?: TrendEvidenceSort
  tweets: PortalTweet[]
  nextOffset?: number | null
}

export const MAX_TREND_EVIDENCE_CACHE_ENTRIES = 96

function tweetFallsWithinRange(
  tweet: PortalTweet,
  range: TrendEvidenceRange,
): boolean {
  const createdAt = new Date(tweet.createdAt).getTime()
  return (
    Number.isFinite(createdAt) &&
    createdAt >= new Date(`${range.since}T00:00:00.000Z`).getTime() &&
    createdAt < new Date(`${range.until}T00:00:00.000Z`).getTime()
  )
}

export function trendEvidenceCacheKey(
  term: string,
  range: TrendEvidenceRange | null,
  sort: TrendEvidenceSort = 'newest',
): string {
  return `${term}\u0000${range ? `${range.since}-${range.until}` : 'any'}\u0000${sort}`
}

export function storeTrendEvidence(
  cache: Map<string, TrendEvidenceCacheEntry>,
  entry: TrendEvidenceCacheEntry,
  { append = false }: { append?: boolean } = {},
): void {
  const sort = entry.sort ?? 'newest'
  const key = trendEvidenceCacheKey(entry.term, entry.range, sort)
  const existing = append ? cache.get(key) : undefined
  const tweets = new Map<string, PortalTweet>()
  existing?.tweets.forEach((tweet) => tweets.set(tweet.id, tweet))
  entry.tweets.forEach((tweet) => tweets.set(tweet.id, tweet))
  cache.delete(key)
  cache.set(key, {
    ...entry,
    sort,
    tweets: Array.from(tweets.values()),
    nextOffset: entry.nextOffset ?? null,
  })
  while (cache.size > MAX_TREND_EVIDENCE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) return
    cache.delete(oldestKey)
  }
}

/**
 * Whether the cache can answer this term/range without a top-up request.
 * An exact response is complete even when empty. A broader response is only
 * complete when a full page of its returned tweets survives local filtering.
 */
export function hasCompleteTrendEvidence(
  cache: ReadonlyMap<string, TrendEvidenceCacheEntry>,
  term: string,
  range: TrendEvidenceRange | null,
  _limit = 30,
  sort: TrendEvidenceSort = 'newest',
): boolean {
  return cache.has(trendEvidenceCacheKey(term, range, sort))
}

export function trendEvidenceNextOffset(
  cache: ReadonlyMap<string, TrendEvidenceCacheEntry>,
  term: string,
  range: TrendEvidenceRange | null,
  sort: TrendEvidenceSort = 'newest',
): number | null | undefined {
  return cache.get(trendEvidenceCacheKey(term, range, sort))?.nextOffset
}

export function cachedTrendEvidence(
  cache: ReadonlyMap<string, TrendEvidenceCacheEntry>,
  includedTerms: string[],
  range: TrendEvidenceRange | null,
  sort: TrendEvidenceSort = 'newest',
): PortalTweet[] {
  const included = new Set(includedTerms)
  const unique = new Map<string, PortalTweet>()

  cache.forEach((entry) => {
    if (!included.has(entry.term)) return
    if ((entry.sort ?? 'newest') !== sort) return
    for (const tweet of entry.tweets) {
      const createdAt = new Date(tweet.createdAt).getTime()
      if (!Number.isFinite(createdAt)) continue
      if (range && !tweetFallsWithinRange(tweet, range)) continue
      unique.set(tweet.id, tweet)
    }
  })

  const direction = sort === 'oldest' ? 1 : -1
  return Array.from(unique.values()).sort(
    (left, right) =>
      direction *
      (new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime() || left.id.localeCompare(right.id)),
  )
}
