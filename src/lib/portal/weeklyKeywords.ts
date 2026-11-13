import type { TermWeek } from './types'

type WeeklyKeywordRow = {
  term: string
  lane: 'emerging' | 'rising' | 'falling'
  currentTweets: number
  previousTweets: number
  currentAuthors: number
  previousAuthors: number
  currentPer100k: number
  previousPer100k: number
  changePct: number | null
}

export interface WeeklyKeywordsResponse {
  data: WeeklyKeywordRow[]
  /** Next-ranked terms per lane, for backfilling rows merged into a story. */
  reserve?: WeeklyKeywordRow[]
  window: {
    endDate: string
    sinceDate: string
    untilDate: string
    previousSinceDate: string
    previousUntilDate: string
  }
  population: 'community_members'
}

/**
 * Spare terms (`reserve: true`) are appended only on request: the homepage
 * uses them to refill rows that trend stories merged, every other consumer
 * keeps the six ranked terms.
 */
export function mapWeeklyKeywords(
  response: WeeklyKeywordsResponse,
  { includeReserve = false }: { includeReserve?: boolean } = {},
): TermWeek[] {
  const invalid = () => new Error('ClickHouse returned invalid weekly keywords')
  if (
    !response ||
    response.population !== 'community_members' ||
    !Array.isArray(response.data) ||
    response.data.length > 6 ||
    (response.reserve !== undefined &&
      (!Array.isArray(response.reserve) || response.reserve.length > 6)) ||
    !response.window
  )
    throw invalid()
  const {
    endDate,
    sinceDate,
    untilDate,
    previousSinceDate,
    previousUntilDate,
  } = response.window
  const dates = [
    endDate,
    sinceDate,
    untilDate,
    previousSinceDate,
    previousUntilDate,
  ]
  if (
    dates.some(
      (date) =>
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date,
    )
  )
    throw invalid()
  const end = Date.parse(endDate)
  if (
    [sinceDate, untilDate, previousSinceDate, previousUntilDate].some(
      (date, index) =>
        Date.parse(date) !== end - [7, 1, 14, 8][index] * 86_400_000,
    )
  )
    throw invalid()
  const seen = new Set<string>()
  const counters = () => ({ emerging: 0, rising: 0, falling: 0 })
  const toTermWeek = (
    row: WeeklyKeywordRow,
    lanes: Record<WeeklyKeywordRow['lane'], number>,
    reserve: boolean,
  ): TermWeek => {
    if (
      !row ||
      !Object.hasOwn(lanes, row.lane) ||
      ++lanes[row.lane] > 2 ||
      typeof row.term !== 'string' ||
      !row.term.trim() ||
      row.term.length > 100 ||
      seen.has(row.term) ||
      [
        row.currentTweets,
        row.previousTweets,
        row.currentAuthors,
        row.previousAuthors,
      ].some((count) => !Number.isSafeInteger(count) || count < 0) ||
      [row.currentPer100k, row.previousPer100k].some(
        (share) => !Number.isFinite(share) || share < 0,
      ) ||
      row.currentAuthors > row.currentTweets ||
      row.previousAuthors > row.previousTweets ||
      (row.changePct !== null &&
        (!Number.isFinite(row.changePct) || row.changePct < -100)) ||
      (row.previousTweets === 0) !== (row.changePct === null)
    )
      throw invalid()
    seen.add(row.term)
    return {
      ...(reserve ? { reserve: true as const } : {}),
      term: row.term,
      lane: row.lane,
      last7: row.currentTweets,
      prev7: row.previousTweets,
      currentAuthors: row.currentAuthors,
      currentPer100k: row.currentPer100k,
      previousPer100k: row.previousPer100k,
      previousAuthors: row.previousAuthors,
      sinceDate,
      untilDate,
      deltaPct: row.changePct,
      status: row.previousTweets
        ? 'comparable'
        : row.currentTweets
          ? 'new'
          : 'inactive',
    }
  }
  const lanes = counters()
  const primary = response.data.map((row) => toTermWeek(row, lanes, false))
  const reserveLanes = counters()
  const reserve = (response.reserve ?? []).map((row) =>
    toTermWeek(row, reserveLanes, true),
  )
  return includeReserve ? [...primary, ...reserve] : primary
}
