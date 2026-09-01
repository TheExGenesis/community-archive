import type { PortalTweet } from '@/lib/portal/types'

export interface MapAnnotation {
  id: string
  label: string
  kind: string
  day: number
  rank: number
  score: number
  tweets: PortalTweet[]
}

export interface ConversationMapData {
  year: number
  years: number[]
  annotations: MapAnnotation[]
}

export const DAY = 86_400_000
export const yearDays = (year: number) =>
  (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY

export function boundedRange(lo: number, span: number, days: number) {
  const width = Math.min(days, Math.max(7, span))
  const start = Math.max(0, Math.min(days - width, lo))
  return [start, start + width] as const
}
