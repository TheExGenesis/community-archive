import 'server-only'
import {
  hydrateBulletinNotices,
  loadBulletinBoardState,
  loadBulletinRelationships,
  type StoredNotice,
} from './data'
import { isPast, sortNotices } from './board'
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
 * only source-verified card contents are returned.
 */
export async function loadBulletinPage(
  filters: BulletinFilters,
  after?: string,
): Promise<BulletinPage> {
  const now = Date.now()
  const search = filters.search.trim().toLowerCase()
  const [state, personal] = await Promise.all([
    loadBulletinBoardState(),
    loadBulletinRelationships(),
  ])
  const me = personal.account_id
  const chosenKinds = parseKinds(filters.kind) ?? []
  const inKinds = (o: { kind: string }) =>
    !chosenKinds.length || chosenKinds.includes(o.kind)
  const known = state.notices.filter((o) => o.kind in KIND_LABELS)
  const bySide = known.filter(
    (o) => filters.side === 'all' || o.side === filters.side,
  )
  const byKind = known.filter(inKinds)
  const eligible = bySide.filter(inKinds)
  const verified = new Map<string, Notice>()
  const rejected = new Set<string>()
  async function hydrate(notices: StoredNotice[]) {
    if (!notices.length) return
    const rows = await hydrateBulletinNotices({ ...state, notices })
    const found = new Set(rows.map((o) => o.tweet_id))
    for (const o of notices)
      if (!found.has(o.tweet_id)) rejected.add(o.tweet_id)
    for (const o of rows) verified.set(o.tweet_id, o)
  }
  const live = (o: StoredNotice): Notice => verified.get(o.tweet_id) || o
  const shown = (o: Notice) =>
    !rejected.has(o.tweet_id) &&
    (filters.past || !isPast(o, now)) &&
    matches(o, search)

  // Select the first page from metadata order, then verify it against the
  // live source. A self-quote can renew an otherwise expired undated notice,
  // so those are checked up front and pagination never silently loses them.
  // Full-text search deliberately checks every candidate, not just page one.
  const metadataOrder = sortNotices(
    eligible,
    filters.recommended,
    me,
    personal,
    now,
    filters.ascending,
  )
  const active = metadataOrder.filter((o) => filters.past || !isPast(o, now))
  const start = after ? active.findIndex((o) => o.tweet_id === after) + 1 : 0
  const first = active.slice(start, start + BULLETIN_PAGE_SIZE)
  const preflight = new Map(
    [...eligible.filter((o) => !o.expires_at && isPast(o, now)), ...first].map(
      (o) => [o.tweet_id, o],
    ),
  )
  await hydrate(
    search ? eligible : (Array.from(preflight.values()) as StoredNotice[]),
  )

  const rows = sortNotices(
    eligible.map(live).filter(shown),
    filters.recommended,
    me,
    personal,
    now,
    filters.ascending,
  )
  const index = after ? rows.findIndex((o) => o.tweet_id === after) : -1
  if (after && index < 0)
    throw new BulletinCursorExpired('The board changed. Refresh to continue.')
  let position = index + 1
  const selected: Notice[] = []
  // Fill holes from removed/edited posts without returning unverified summaries.
  while (selected.length < BULLETIN_PAGE_SIZE && position < rows.length) {
    const chunk = rows.slice(
      position,
      position + BULLETIN_PAGE_SIZE - selected.length,
    )
    await hydrate(
      chunk.filter(
        (o) => !verified.has(o.tweet_id) && !rejected.has(o.tweet_id),
      ) as StoredNotice[],
    )
    for (const row of chunk) {
      const current = verified.get(row.tweet_id)
      if (current && shown(current)) selected.push(current)
    }
    position += chunk.length
  }

  // Chip and toggle counts under the other dimension's current filter, so a
  // reader can see where notices are before clicking. Metadata-based except
  // where a source was already checked; the footer says counts may adjust.
  const counts: Record<string, number> = {}
  for (const kind of Object.keys(KIND_LABELS)) counts[kind] = 0
  counts.offer = 0
  counts.ask = 0
  for (const o of bySide.map(live)) if (shown(o)) counts[o.kind]++
  for (const o of byKind.map(live)) if (shown(o)) counts[o.side]++

  return {
    notices: selected,
    counts,
    cursors: {
      [filters.kind]:
        position < rows.length ? rows[position - 1].tweet_id : null,
    },
    total: state.notices.length,
    now,
    personal,
  }
}
