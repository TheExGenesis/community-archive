import type { Notice } from './types'

export type BulletinRelationships = {
  outgoing: Record<string, number>
  available: boolean
  following?: string[]
  followers?: string[]
}
/** Follow relation from archived follow lists; '' when unknown or none. */
export function followLabel(accountId: string, graph: BulletinRelationships) {
  const follows = graph.following?.includes(accountId) ?? false
  const followed = graph.followers?.includes(accountId) ?? false
  if (follows && followed) return 'mutual'
  if (follows) return 'following'
  if (followed) return 'follows you'
  return ''
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
/** Public replies plus quote posts by archived members, once hydrated. */
export function uptake(notice: Notice): number | null {
  if (notice.replies === undefined && notice.quotes === undefined) return null
  return (notice.replies || 0) + (notice.quotes || 0)
}
function unansweredAsk(notice: Notice) {
  return notice.side === 'ask' && uptake(notice) === 0
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
/**
 * Recommended: active before past; your notices, then people you interact
 * with, then everyone; within a group, asks nobody has answered first, then
 * newest. Newest: chronological, active before past. Ascending reverses the
 * order inside the active/past split.
 */
export function sortNotices(
  notices: Notice[],
  recommended: boolean,
  me: string,
  graph: BulletinRelationships,
  now: number,
  ascending = false,
) {
  const inner = (a: Notice, b: Notice) =>
    (recommended
      ? relationship(a, me, graph).rank - relationship(b, me, graph).rank ||
        Number(unansweredAsk(b)) - Number(unansweredAsk(a)) ||
        (graph.outgoing?.[b.account_id] || 0) -
          (graph.outgoing?.[a.account_id] || 0)
      : 0) ||
    Date.parse(b.posted_at) - Date.parse(a.posted_at) ||
    b.tweet_id.localeCompare(a.tweet_id)
  return [...notices].sort(
    (a, b) =>
      Number(isPast(a, now)) - Number(isPast(b, now)) ||
      (ascending ? -inner(a, b) : inner(a, b)),
  )
}
