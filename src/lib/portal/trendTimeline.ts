import type { TrendGranularity } from './types'
import type { TrendRange } from './trendExplorerState'

export type TimelinePreset = '12m' | '12w' | '15d'
export const presetGranularity = {
  '12m': 'month',
  '12w': 'week',
  '15d': 'day',
} as const
const DAY = 86_400_000
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
export function bucketDate(bucket: string): Date {
  return new Date(
    `${bucket.length === 4 ? `${bucket}-01-01` : bucket.length === 7 ? `${bucket}-01` : bucket}T00:00:00Z`,
  )
}
export function bucketEnd(bucket: string): Date {
  const date = bucketDate(bucket)
  if (bucket.length === 4) date.setUTCFullYear(date.getUTCFullYear() + 1)
  else if (bucket.length === 7) date.setUTCMonth(date.getUTCMonth() + 1)
  else date.setUTCDate(date.getUTCDate() + 1)
  return date
}
export function bucketKey(date: Date, granularity: TrendGranularity): string {
  if (granularity === 'year') return dayKey(date).slice(0, 4)
  if (granularity === 'month') return dayKey(date).slice(0, 7)
  const start = new Date(date)
  if (granularity === 'week')
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return dayKey(start)
}
// Fine detail is deliberately bounded; full history remains available by month/year.
export function recentBuckets(
  granularity: 'day' | 'week',
  now: Date,
): string[] {
  const count = granularity === 'day' ? 90 : 52
  const step = granularity === 'day' ? DAY : 7 * DAY
  const last = bucketDate(bucketKey(now, granularity)).getTime()
  return Array.from({ length: count }, (_, i) =>
    dayKey(new Date(last - (count - i - 1) * step)),
  )
}
export function presetRange(
  preset: TimelinePreset,
  buckets: string[],
): TrendRange | null {
  if (!buckets.length) return null
  const count = preset === '15d' ? 15 : 12
  return {
    start: buckets[Math.max(0, buckets.length - count)],
    end: buckets[buckets.length - 1],
  }
}
