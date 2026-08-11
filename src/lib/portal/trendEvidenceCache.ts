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

export function cachedTrendEvidence(
  cache: ReadonlyMap<string, TrendEvidenceCacheEntry>,
  includedTerms: string[],
  range: TrendEvidenceRange | null,
  limit = 30,
): PortalTweet[] {
  const included = new Set(includedTerms)
  const rangeStart = range ? Date.UTC(range.start, 0, 1) : null
  const rangeEnd = range ? Date.UTC(range.end + 1, 0, 1) : null
  const unique = new Map<string, PortalTweet>()

  cache.forEach((entry) => {
    if (!included.has(entry.term)) return
    for (const tweet of entry.tweets) {
      const createdAt = new Date(tweet.createdAt).getTime()
      if (!Number.isFinite(createdAt)) continue
      if (rangeStart !== null && createdAt < rangeStart) continue
      if (rangeEnd !== null && createdAt >= rangeEnd) continue
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
