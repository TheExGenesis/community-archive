import type { PortalTweet } from './types'

export interface TrendEvidenceRange {
  start: number
  end: number
}

export interface TrendEvidenceCacheEntry {
  term: string
  range: TrendEvidenceRange | null
  tweets: PortalTweet[]
}

export const MAX_TREND_EVIDENCE_CACHE_ENTRIES = 96

function tweetFallsWithinRange(
  tweet: PortalTweet,
  range: TrendEvidenceRange,
): boolean {
  const createdAt = new Date(tweet.createdAt).getTime()
  return (
    Number.isFinite(createdAt) &&
    createdAt >= Date.UTC(range.start, 0, 1) &&
    createdAt < Date.UTC(range.end + 1, 0, 1)
  )
}

export function trendEvidenceCacheKey(
  term: string,
  range: TrendEvidenceRange | null,
): string {
  return `${term}\u0000${range ? `${range.start}-${range.end}` : 'any'}`
}

export function storeTrendEvidence(
  cache: Map<string, TrendEvidenceCacheEntry>,
  entry: TrendEvidenceCacheEntry,
): void {
  const key = trendEvidenceCacheKey(entry.term, entry.range)
  cache.delete(key)
  cache.set(key, entry)
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
  limit = 30,
): boolean {
  if (cache.has(trendEvidenceCacheKey(term, range))) return true
  if (!range) return false

  return Array.from(cache.values()).some((entry) => {
    if (entry.term !== term) return false
    if (
      entry.range &&
      (entry.range.start > range.start || entry.range.end < range.end)
    ) {
      return false
    }
    return (
      entry.tweets.filter((tweet) => tweetFallsWithinRange(tweet, range))
        .length >= limit
    )
  })
}

export function cachedTrendEvidence(
  cache: ReadonlyMap<string, TrendEvidenceCacheEntry>,
  includedTerms: string[],
  range: TrendEvidenceRange | null,
  limit = 30,
): PortalTweet[] {
  const included = new Set(includedTerms)
  const unique = new Map<string, PortalTweet>()

  cache.forEach((entry) => {
    if (!included.has(entry.term)) return
    for (const tweet of entry.tweets) {
      const createdAt = new Date(tweet.createdAt).getTime()
      if (!Number.isFinite(createdAt)) continue
      if (range && !tweetFallsWithinRange(tweet, range)) continue
      unique.set(tweet.id, tweet)
    }
  })

  return Array.from(unique.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime() || right.id.localeCompare(left.id),
    )
    .slice(0, Math.max(1, limit))
}
