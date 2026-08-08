const DAY_MS = 86_400_000

export const PORTAL_STREAM_POLL_INTERVAL_MS = 60_000

export function estimateLiveTweetCount({
  totalTweets,
  streamedLast24Hours,
  generatedAt,
  now = Date.now(),
}: {
  totalTweets: number
  streamedLast24Hours: number
  generatedAt: string
  now?: number
}): number {
  const generatedAtMs = Date.parse(generatedAt)
  if (!Number.isFinite(generatedAtMs) || streamedLast24Hours <= 0) {
    return totalTweets
  }

  const elapsedMs = Math.min(Math.max(now - generatedAtMs, 0), DAY_MS)
  const estimatedGain = Math.floor((elapsedMs / DAY_MS) * streamedLast24Hours)
  return totalTweets + estimatedGain
}

export function liveCounterRefreshInterval(
  streamedLast24Hours: number,
): number | null {
  if (streamedLast24Hours <= 0) return null
  return Math.min(
    PORTAL_STREAM_POLL_INTERVAL_MS,
    Math.max(1_000, Math.floor(DAY_MS / streamedLast24Hours)),
  )
}
