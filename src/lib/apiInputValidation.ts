const DAY_MS = 24 * 60 * 60 * 1000

export const MAX_AGGREGATE_RANGE_MS = 365 * DAY_MS

export const isTwitterUsername = (value: string) =>
  /^[A-Za-z0-9_]{1,15}$/.test(value)

export type DateRangeValidation =
  | { ok: true; start: Date; end: Date }
  | { ok: false; error: 'invalid' | 'order' | 'range' }

export const validateDateRange = (
  startRaw: string,
  endRaw: string,
  maxRangeMs: number,
): DateRangeValidation => {
  const start = new Date(startRaw)
  const end = new Date(endRaw)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'invalid' }
  }
  if (start.getTime() > end.getTime()) {
    return { ok: false, error: 'order' }
  }
  if (end.getTime() - start.getTime() > maxRangeMs) {
    return { ok: false, error: 'range' }
  }

  return { ok: true, start, end }
}

const STATS_RANGE_LIMITS_MS = {
  minute: 7 * DAY_MS,
  hour: MAX_AGGREGATE_RANGE_MS,
  day: MAX_AGGREGATE_RANGE_MS,
  week: MAX_AGGREGATE_RANGE_MS,
  month: MAX_AGGREGATE_RANGE_MS,
} as const

export type StatsGranularity = keyof typeof STATS_RANGE_LIMITS_MS

export const getStatsRangeLimitMs = (value: string): number | null =>
  Object.prototype.hasOwnProperty.call(STATS_RANGE_LIMITS_MS, value)
    ? STATS_RANGE_LIMITS_MS[value as StatsGranularity]
    : null
