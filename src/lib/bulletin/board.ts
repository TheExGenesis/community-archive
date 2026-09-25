import type { Notice } from './types'
import type { JevSort } from './curation'

export type BulletinRelationships = {
  outgoing: Record<string, number>
  available: boolean
}
export function expiry(notice: Notice): number | null {
  if (notice.expires_at)
    return Date.parse(notice.expires_at + 'T00:00:00Z') + 86400000
  if (notice.standing) return null
  const start = Math.max(
    Date.parse(notice.posted_at),
    Date.parse(notice.renewed_at || notice.posted_at),
  )
  return start + (notice.side === 'ask' ? 14 : 60) * 86400000
}
export function isPast(notice: Notice, now: number) {
  const until = expiry(notice)
  return until !== null && until <= now
}
export function isResolved(notice: Notice) {
  return notice.resolution_state === 'resolved'
}
export function visibleStatus(
  notice: Notice,
  now: number,
  past: boolean,
  resolved: boolean,
) {
  return isResolved(notice) ? resolved : past || !isPast(notice, now)
}
/** Public replies plus quote posts by archived members, once hydrated. */
export function uptake(notice: Notice): number | null {
  if (notice.replies === undefined && notice.quotes === undefined) return null
  return (notice.replies || 0) + (notice.quotes || 0)
}
function unansweredAsk(notice: Notice) {
  return notice.side === 'ask' && uptake(notice) === 0
}
export function isRecommendedCandidate(
  notice: Notice,
  recommended: boolean,
  me: string,
) {
  return !recommended || !me || notice.account_id !== me
}
export function relationship(
  notice: Notice,
  me: string,
  graph: BulletinRelationships,
) {
  if (me && notice.account_id === me) return { rank: 0, label: '' }
  const count = graph.outgoing?.[notice.account_id] || 0
  if (count > 0) return { rank: 1, label: '' }
  return { rank: 3, label: '' }
}
function recommendationScore(
  notice: Notice,
  graph: BulletinRelationships,
  now: number,
  rankUnanswered: boolean,
) {
  // Use the original posting date: catching up an old notice does not make
  // it newly posted. Freshness halves every three days, without a hard cutoff.
  const ageDays = Math.max(0, (now - Date.parse(notice.posted_at)) / 86400000)
  const freshness = 4 * 2 ** (-ageDays / 3)
  const interactions = Math.max(0, graph.outgoing?.[notice.account_id] || 0)
  // Keep personal relevance, but bound it so a prolific contact cannot pin
  // their old notices above every recent post. One to 100 interactions: 1–2.
  const relevance = interactions
    ? 1 + Math.min(1, Math.log10(interactions) / 2)
    : 0
  // Only Jev notices have a value estimate. It is a rough sorting signal,
  // tempered by opportunity and joke probabilities, not a dollar valuation.
  const value =
    Math.max(0, Math.min(4, notice.value_score ?? 0)) *
    Math.max(0, Math.min(1, notice.p_opportunity ?? 0)) *
    (1 - Math.max(0, Math.min(1, notice.p_joke ?? 0)))
  return (
    freshness +
    relevance +
    value +
    (rankUnanswered && unansweredAsk(notice) ? 0.5 : 0)
  )
}

/**
 * Recommended excludes your notices, then blends freshness, outgoing
 * interactions and unanswered asks. Newest stays chronological. Both keep
 * resolved/past notices last; ascending reverses only within those groups.
 */
export function sortNotices(
  notices: Notice[],
  recommended: boolean,
  me: string,
  graph: BulletinRelationships,
  now: number,
  ascending = false,
  rankUnanswered = true,
  sortBy: JevSort | null = null,
) {
  const metric = (notice: Notice) => {
    if (sortBy === 'value') return notice.value_score ?? -1
    if (sortBy === 'opportunity') return notice.p_opportunity ?? -1
    if (sortBy === 'joke') return -(notice.p_joke ?? 2)
    return 0
  }
  const inner = (a: Notice, b: Notice) =>
    (sortBy
      ? metric(b) - metric(a)
      : recommended
        ? recommendationScore(b, graph, now, rankUnanswered) -
            recommendationScore(a, graph, now, rankUnanswered) ||
          (graph.outgoing?.[b.account_id] || 0) -
            (graph.outgoing?.[a.account_id] || 0)
        : 0) ||
    Date.parse(b.posted_at) - Date.parse(a.posted_at) ||
    b.tweet_id.localeCompare(a.tweet_id)
  return notices
    .filter((o) => isRecommendedCandidate(o, recommended, me))
    .sort(
      (a, b) =>
        Number(isResolved(a)) - Number(isResolved(b)) ||
        Number(isPast(a, now)) - Number(isPast(b, now)) ||
        (ascending ? -inner(a, b) : inner(a, b)),
    )
}
