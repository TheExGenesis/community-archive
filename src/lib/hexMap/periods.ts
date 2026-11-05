export const BEST_PERIODS = ['week', 'month', 'quarter', 'year', 'all'] as const
export type BestPeriod = (typeof BEST_PERIODS)[number]
export const PERIOD_LABELS: Record<BestPeriod, string> = {
  week: 'Last 7 days',
  month: 'Last month',
  quarter: 'Last 3 months',
  year: 'Last year',
  all: 'All time',
}
