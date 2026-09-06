import type { PortalTweet } from './types'

const HOMEPAGE_RECENCY_QUOTA = 4
const HOMEPAGE_EXCLUDED_USERNAMES = new Set(['bot'])

function compareTweetIdsDescending(left: string, right: string): number {
  return right.length - left.length || right.localeCompare(left)
}

export function comparePortalTweetChronology(
  left: PortalTweet,
  right: PortalTweet,
): number {
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
    compareTweetIdsDescending(left.id, right.id)
  )
}

function mergeTweet(previous: PortalTweet, next: PortalTweet): PortalTweet {
  return {
    ...previous,
    ...next,
    followers: next.followers ?? previous.followers,
    quoteCount: next.quoteCount ?? previous.quoteCount,
    media: next.media?.length ? next.media : previous.media,
    quotedTweet: next.quotedTweet ?? previous.quotedTweet,
  }
}

function homepageAttentionScore(tweet: PortalTweet, now: Date): number {
  const ageHours = Math.max(
    0,
    (now.getTime() - new Date(tweet.createdAt).getTime()) / 3_600_000,
  )
  const recency = Math.max(0, 48 - ageHours) * 0.35
  const likes = Math.log1p(Math.max(0, tweet.likes)) * 6
  const reposts = Math.log1p(Math.max(0, tweet.rts)) * 8
  const quotes = Math.log1p(Math.max(0, tweet.quoteCount ?? 0)) * 12
  const audience = Math.log10(Math.max(0, tweet.followers ?? 0) + 10) * 3
  return recency + likes + reposts + quotes + audience
}

/**
 * Keep the homepage visibly live, then use the remaining slots for recent
 * posts with stronger engagement, quote, or audience signals.
 */
export function selectHomepageStream(
  tweets: PortalTweet[],
  limit = 30,
  now = new Date(),
): PortalTweet[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const byId = new Map<string, PortalTweet>()
  for (const tweet of tweets) {
    if (HOMEPAGE_EXCLUDED_USERNAMES.has(tweet.username.toLowerCase())) continue
    const createdAt = new Date(tweet.createdAt)
    if (Number.isNaN(createdAt.getTime())) continue
    const previous = byId.get(tweet.id)
    byId.set(tweet.id, previous ? mergeTweet(previous, tweet) : tweet)
  }

  const chronological = Array.from(byId.values()).sort(
    comparePortalTweetChronology,
  )
  const recent = chronological.slice(
    0,
    Math.min(HOMEPAGE_RECENCY_QUOTA, safeLimit),
  )
  const recentIds = new Set(recent.map((tweet) => tweet.id))
  const ranked = chronological
    .filter((tweet) => !recentIds.has(tweet.id))
    .sort(
      (left, right) =>
        homepageAttentionScore(right, now) -
          homepageAttentionScore(left, now) ||
        comparePortalTweetChronology(left, right),
    )

  return [...recent, ...ranked].slice(0, safeLimit)
}
