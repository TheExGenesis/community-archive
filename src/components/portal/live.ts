const DAY_MS = 86_400_000

export const PORTAL_STREAM_POLL_INTERVAL_MS = 60_000
export const LIVE_COUNTER_CATCH_UP_DURATION_MS = 60_000

export function estimateLiveTweetGain(
  streamedLast24Hours: number,
  elapsedMs: number,
): number {
  if (streamedLast24Hours <= 0 || elapsedMs <= 0) return 0
  return Math.floor((elapsedMs / DAY_MS) * streamedLast24Hours)
}

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
  return totalTweets + estimateLiveTweetGain(streamedLast24Hours, elapsedMs)
}

export function interpolateLiveTweetCount({
  startCount,
  targetCount,
  elapsedMs,
  durationMs = LIVE_COUNTER_CATCH_UP_DURATION_MS,
}: {
  startCount: number
  targetCount: number
  elapsedMs: number
  durationMs?: number
}): number {
  if (targetCount <= startCount || durationMs <= 0) return startCount
  const progress = Math.min(Math.max(elapsedMs / durationMs, 0), 1)
  return startCount + Math.floor((targetCount - startCount) * progress)
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
