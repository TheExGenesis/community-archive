import type {
  PortalTrends,
  TrendGranularity,
  TrendBucketSeries,
} from '@/lib/portal/types'
import type { TrendRange } from '@/lib/portal/trendExplorerState'
import type { TrendEvidenceRange } from '@/lib/portal/trendEvidenceCache'

export function sameEvidenceRange(
  left: TrendEvidenceRange | null,
  right: TrendEvidenceRange | null,
): boolean {
  return left?.since === right?.since && left?.until === right?.until
}

export function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
}

export function evidenceRange(
  range: TrendRange | null,
  granularity: TrendGranularity,
): TrendEvidenceRange | null {
  if (!range) return null
  if (granularity === 'month') {
    return { since: `${range.start}-01`, until: nextMonthStart(range.end) }
  }
  return {
    since: `${range.start}-01-01`,
    until: `${Number(range.end) + 1}-01-01`,
  }
}

export function convertedRange(
  range: TrendRange | null,
  granularity: TrendGranularity,
): TrendRange | null {
  if (!range) return null
  return granularity === 'month'
    ? {
        start: `${range.start.slice(0, 4)}-01`,
        end: `${range.end.slice(0, 4)}-12`,
      }
    : { start: range.start.slice(0, 4), end: range.end.slice(0, 4) }
}

export function annualSeries(initialTrends: PortalTrends): TrendBucketSeries[] {
  return initialTrends.series.map((item) => ({
    term: item.term,
    color: item.color,
    tweetsPerBucket: item.tweetsPerYear,
    perBucket: item.perYear,
  }))
}

export function snapshotBuckets(
  initialTrends: PortalTrends,
  granularity: TrendGranularity,
): string[] {
  if (granularity === 'year') return initialTrends.years.map(String)
  const firstYear = initialTrends.years[0]
  const lastYear = initialTrends.years.at(-1)
  if (firstYear === undefined || lastYear === undefined) return []
  const computedAt = new Date(initialTrends.computedAt)
  const lastMonth =
    !Number.isNaN(computedAt.getTime()) &&
    computedAt.getUTCFullYear() === lastYear
      ? computedAt.getUTCMonth() + 1
      : 12
  const count = (lastYear - firstYear) * 12 + lastMonth
  return Array.from({ length: count }, (_, index) => {
    const year = firstYear + Math.floor(index / 12)
    const month = (index % 12) + 1
    return `${year}-${String(month).padStart(2, '0')}`
  })
}

export function bucketLabel(
  bucket: string,
  granularity: TrendGranularity,
): string {
  if (granularity === 'year') return bucket
  const [year, month] = bucket.split('-').map(Number)
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}
