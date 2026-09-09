import { KIND_LABELS, type Opportunity } from './types'

const CATEGORY_ORDER = Object.keys(KIND_LABELS)

export type BulletinRelationships = {
  outgoing: Record<string, number>
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
  const count = graph.outgoing?.[notice.account_id] || 0
  if (count > 0)
    return { rank: 1, label: `You → them · ${count.toLocaleString('en-US')}` }
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
        ? CATEGORY_ORDER.indexOf(a.kind) - CATEGORY_ORDER.indexOf(b.kind)
        : 0) ||
      (recommended
        ? relationship(a, me, graph).rank - relationship(b, me, graph).rank ||
          (graph.outgoing?.[b.account_id] || 0) -
            (graph.outgoing?.[a.account_id] || 0)
        : 0) ||
      Date.parse(b.posted_at) - Date.parse(a.posted_at) ||
      b.tweet_id.localeCompare(a.tweet_id),
  )
}
