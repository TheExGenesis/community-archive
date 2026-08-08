const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const LIVE_COUNTER_FRONT_LOAD_POWER = 1.35
const LIVE_COUNTER_BURST_MULTIPLIERS = [
  0.55, 1.35, 0.75, 1.75, 0.6, 1.15, 1.45, 0.4,
]

export const PORTAL_STREAM_POLL_INTERVAL_MS = 60_000
export const LIVE_COUNTER_CATCH_UP_DURATION_MS = 300_000
export const LIVE_COUNTER_CATCH_UP_WINDOW_MS = HOUR_MS
export const LIVE_COUNTER_CATCH_UP_BURST_BASE_MS = 4_000

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

export function liveTweetCatchUpRange({
  totalTweets,
  streamedLast24Hours,
  generatedAt,
  now = Date.now(),
}: {
  totalTweets: number
  streamedLast24Hours: number
  generatedAt: string
  now?: number
}): { startCount: number; targetCount: number } {
  const targetCount = estimateLiveTweetCount({
    totalTweets,
    streamedLast24Hours,
    generatedAt,
    now,
  })
  const oneHourGain = estimateLiveTweetGain(
    streamedLast24Hours,
    LIVE_COUNTER_CATCH_UP_WINDOW_MS,
  )

  return {
    startCount: Math.max(totalTweets, targetCount - oneHourGain),
    targetCount,
  }
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
  const linearProgress = Math.min(Math.max(elapsedMs / durationMs, 0), 1)
  const progress =
    1 - Math.pow(1 - linearProgress, LIVE_COUNTER_FRONT_LOAD_POWER)
  return startCount + Math.floor((targetCount - startCount) * progress)
}

export function liveCounterBurstDelay(
  baseIntervalMs: number,
  burstIndex: number,
): number {
  const multiplier =
    LIVE_COUNTER_BURST_MULTIPLIERS[
      Math.abs(Math.trunc(burstIndex)) % LIVE_COUNTER_BURST_MULTIPLIERS.length
    ]
  return Math.min(
    PORTAL_STREAM_POLL_INTERVAL_MS,
    Math.max(250, Math.round(baseIntervalMs * multiplier)),
  )
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
