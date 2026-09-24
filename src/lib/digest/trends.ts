import type { TermWeek } from '@/lib/portal/types'

export interface DigestTrendMovers {
  riser: TermWeek | null
  faller: TermWeek | null
}

/** Pick the strongest comparable movers from the same rows shown on Home. */
export function selectDigestTrendMovers(
  rows: TermWeek[],
): DigestTrendMovers | null {
  const comparable = rows.filter(
    (row) => row.status === 'comparable' && row.deltaPct !== null,
  )
  const riser =
    comparable
      .filter((row) => row.deltaPct! > 0)
      .sort((a, b) => b.deltaPct! - a.deltaPct!)[0] ?? null
  const faller =
    comparable
      .filter((row) => row.deltaPct! < 0)
      .sort((a, b) => a.deltaPct! - b.deltaPct!)[0] ?? null
  return riser || faller ? { riser, faller } : null
}
