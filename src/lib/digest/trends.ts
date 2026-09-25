import type { TermWeek } from '@/lib/portal/types'

export interface DigestTrendTerm {
  term: string
  tweets: number
  changePct: number | null
}

export interface DigestTrendSnapshot {
  sinceDate: string
  untilDate: string
  terms: DigestTrendTerm[]
}

export const formatDigestShareChange = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('en-US')}%`

const dayBefore = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return null
  return new Date(parsed.getTime() - 86_400_000).toISOString().slice(0, 10)
}

/** Freeze the two highest-volume terms from the Trends widget for this edition. */
export function selectDigestTopTerms(
  rows: TermWeek[],
  digestDate: string,
): DigestTrendSnapshot | null {
  const untilDate = dayBefore(digestDate)
  if (
    !untilDate ||
    !rows.length ||
    rows.some(
      (row) =>
        row.untilDate !== untilDate ||
        !row.sinceDate ||
        !Number.isSafeInteger(row.last7) ||
        row.last7 < 0,
    )
  )
    return null
  const sinceDate = rows[0].sinceDate!
  if (rows.some((row) => row.sinceDate !== sinceDate)) return null
  const terms = [...rows]
    .filter((row) => row.last7 > 0)
    .sort((a, b) => b.last7 - a.last7 || a.term.localeCompare(b.term))
    .slice(0, 2)
    .map((row) => ({
      term: row.term,
      tweets: row.last7,
      changePct: row.deltaPct,
    }))
  return terms.length ? { sinceDate, untilDate, terms } : null
}

/** Invalid or legacy saved values never turn into today's live trends. */
export function parseDigestTrendSnapshot(
  value: unknown,
  digestDate: string,
): DigestTrendSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const snapshot = value as Record<string, unknown>
  if (
    snapshot.untilDate !== dayBefore(digestDate) ||
    typeof snapshot.sinceDate !== 'string' ||
    !Array.isArray(snapshot.terms) ||
    snapshot.terms.length < 1 ||
    snapshot.terms.length > 2 ||
    Date.parse(snapshot.sinceDate) !==
      Date.parse(snapshot.untilDate as string) - 6 * 86_400_000
  )
    return null
  const seen = new Set<string>()
  for (const term of snapshot.terms) {
    if (
      !term ||
      typeof term !== 'object' ||
      typeof term.term !== 'string' ||
      !term.term.trim() ||
      term.term.length > 100 ||
      seen.has(term.term) ||
      !Number.isSafeInteger(term.tweets) ||
      term.tweets <= 0 ||
      (term.changePct !== null &&
        (typeof term.changePct !== 'number' ||
          !Number.isFinite(term.changePct) ||
          term.changePct < -100))
    )
      return null
    seen.add(term.term)
  }
  return snapshot as unknown as DigestTrendSnapshot
}
