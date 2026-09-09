import type { Opportunity } from './types'

export type BulletinRelationships = {
  following: string[]
  followers: string[]
  available: boolean
}
export function expiry(notice: Opportunity): number | null {
  if (notice.expires_at)
    return Date.parse(notice.expires_at + 'T00:00:00Z') + 86400000
  if (notice.standing) return null
  const start = Math.max(
    Date.parse(notice.posted_at),
    Date.parse(notice.renewed_at || notice.posted_at),
  )
  return start + (notice.side === 'ask' ? 14 : 60) * 86400000
}
export function isPast(notice: Opportunity, now: number) {
  const until = expiry(notice)
  return until !== null && until <= now
}
export function relationship(
  notice: Opportunity,
  me: string,
  graph: BulletinRelationships,
) {
  if (notice.account_id === me) return { rank: 0, label: 'You' }
  const following = graph.following.includes(notice.account_id)
  const follower = graph.followers.includes(notice.account_id)
  if (following && follower) return { rank: 1, label: 'Mutual' }
  if (following) return { rank: 2, label: 'You follow' }
  if (follower) return { rank: 2, label: 'Follows you' }
  return { rank: 3, label: '' }
}
export function sortNotices(
  notices: Opportunity[],
  recommended: boolean,
  me: string,
  graph: BulletinRelationships,
  now: number,
) {
  return [...notices].sort(
    (a, b) =>
      Number(isPast(a, now)) - Number(isPast(b, now)) ||
      (recommended
        ? relationship(a, me, graph).rank - relationship(b, me, graph).rank
        : 0) ||
      Date.parse(b.posted_at) - Date.parse(a.posted_at) ||
      b.tweet_id.localeCompare(a.tweet_id),
  )
}
