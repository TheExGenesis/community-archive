import type { PortalTrends } from './types'

export const FIRST_TREND_YEAR = 2019

/** Default terms plotted when the trends explorer first loads. */
export const CHART_TERMS: { term: string; color: string }[] = [
  { term: 'tpot', color: '#3b82f6' },
  { term: 'postrat', color: '#f59e0b' },
  { term: 'egregore', color: '#a78bfa' },
  { term: 'moloch', color: '#f87171' },
  { term: 'vibecamp', color: '#2acf80' },
  { term: 'sensemaking', color: '#38bdf8' },
  { term: 'ai agents', color: '#e879f9' },
]

export const TREND_COLORS = [
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

export function emptyPortalTrends(now = new Date()): PortalTrends {
  const currentYear = now.getUTCFullYear()
  return {
    years: Array.from(
      { length: currentYear - FIRST_TREND_YEAR + 1 },
      (_, index) => FIRST_TREND_YEAR + index,
    ),
    series: [],
    weekly: [],
    computedAt: now.toISOString(),
  }
}
