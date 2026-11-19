import 'server-only'
import { measureServerRead } from '@/lib/performance/server'
import {
  loadBulletinDismissals,
  loadBulletinRelationships,
  loadBulletinViewer,
  loadVerifiedBulletinBoard,
} from './data'
import { isRecommendedCandidate, sortNotices, visibleStatus } from './board'
import { matchesJevFilters } from './curation'
import {
  BULLETIN_PAGE_SIZE,
  KIND_LABELS,
  parseKinds,
  type BulletinFilters,
  type BulletinPage,
  type Notice,
} from './types'

export class BulletinCursorExpired extends Error {}

function matches(notice: Notice, search: string) {
  if (!search) return true
  return [
    notice.summary,
    notice.preview_text,
    notice.username,
    notice.place,
    ...notice.topics,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(search)
}

/**
 * One ranked stream under the active filters, paged by a single cursor keyed
 * by the selected category ('all' or a kind). The directory stays server-side;
 * only source-verified card contents are returned. Sources come pre-checked
 * from the shared board, so a page view only adds the reader's own reads.
 */
export async function loadBulletinPage(
  filters: BulletinFilters,
  after?: string,
  personalize = true,
): Promise<BulletinPage> {
  const now = Date.now()
  const search = filters.search.trim().toLowerCase()
  const [board, hidden, personal] = await Promise.all([
    measureServerRead('bulletin.state', loadVerifiedBulletinBoard),
    // A failed read shows hidden notices again rather than blanking the board.
    measureServerRead('bulletin.dismissals', loadBulletinDismissals).catch(
      () => [] as string[],
    ),
    personalize && filters.recommended && !filters.sortBy
      ? measureServerRead('bulletin.recommendations', loadBulletinRelationships)
      : loadBulletinViewer(),
  ])
  const me = personal.account_id
  const chosenKinds = parseKinds(filters.kind) ?? []
  const inKinds = (o: { kind: string }) =>
    !chosenKinds.length || chosenKinds.includes(o.kind)
  const dismissed = new Set(hidden)
  // Live cards only: a notice whose source check failed is never shown.
  const known = board.notices.flatMap((o) => {
    const card = board.sources.get(o.tweet_id)
    return card &&
      !dismissed.has(o.tweet_id) &&
      o.kind in KIND_LABELS &&
      matchesJevFilters(card, filters) &&
      isRecommendedCandidate(card, filters.recommended, me) &&
      visibleStatus(card, now, filters.past, filters.resolved) &&
      matches(card, search)
      ? [card]
      : []
  })
  const bySide = known.filter(
    (o) => filters.side === 'all' || o.side === filters.side,
  )
  const byKind = known.filter(inKinds)
  const rows = sortNotices(
    bySide.filter(inKinds),
    filters.recommended,
    me,
    personal,
    now,
    filters.ascending,
    false, // Live uptake ranks loaded cards in the client, never the server cursor.
    filters.sortBy,
  )
  const index = after ? rows.findIndex((o) => o.tweet_id === after) : -1
  if (after && index < 0)
    throw new BulletinCursorExpired('The board changed. Refresh to continue.')
  const position = Math.min(index + 1 + BULLETIN_PAGE_SIZE, rows.length)
  const selected = rows.slice(index + 1, position)

  // Chip and toggle counts under the other dimension's current filter, so a
  // reader can see where notices are before clicking.
  const counts: Record<string, number> = {}
  for (const kind of Object.keys(KIND_LABELS)) counts[kind] = 0
  counts.offer = 0
  counts.ask = 0
  for (const o of bySide) counts[o.kind]++
  for (const o of byKind) counts[o.side]++

  return {
    notices: selected,
    counts,
    cursors: {
      [filters.kind]:
        position < rows.length ? rows[position - 1].tweet_id : null,
    },
    total: board.notices.length,
    dismissed: hidden.length,
    now,
    personal,
    recommendationsReady:
      personalize || !filters.recommended || !!filters.sortBy,
  }
}
