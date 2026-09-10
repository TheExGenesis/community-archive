import { CHART_TERMS } from '@/lib/portal/trendConfig'

export const MAX_SERIES = 12
export const SERIES_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#a78bfa',
  '#f87171',
  '#2acf80',
  '#38bdf8',
  '#e879f9',
  '#fb7185',
  '#14b8a6',
  '#8b5cf6',
  '#f97316',
  '#84cc16',
]
export const DEFAULT_TREND_TERMS = CHART_TERMS.map(({ term }) => term)

export function isDefaultTrendSet(
  terms: string[],
  defaults = DEFAULT_TREND_TERMS,
): boolean {
  return (
    terms.length > 0 &&
    terms.length === defaults.length &&
    terms.every((term, index) => term === defaults[index])
  )
}

export type TrendsExplorerAction =
  | 'chart_series_toggled'
  | 'evidence_filter_toggled'
  | 'evidence_refreshed'
  | 'evidence_sort_changed'
  | 'granularity_changed'
  | 'retry_defaults'
  | 'scale_changed'
  | 'term_removed'
  | 'terms_added'
  | 'terms_reactivated'
  | 'year_filter_applied'
  | 'year_filter_cleared'

export type CaptureExplorerAction = (
  action: TrendsExplorerAction,
  overrides?: Partial<{
    seriesCount: number
    enabledSeriesCount: number
    includedSeriesCount: number
    hasYearFilter: boolean
  }>,
) => void
