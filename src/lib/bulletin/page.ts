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
  type BulletinFilters,
  type BulletinPage,
  type Opportunity,
} from './types'

export class BulletinCursorExpired extends Error {}

/** Keep the directory server-side; only send source-verified card contents. */
export async function loadBulletinPage(
  filters: BulletinFilters,
  after?: string,
): Promise<BulletinPage> {
  const now = Date.now()
  const [state, personal] = await Promise.all([
    loadBulletinBoardState(),
    loadBulletinRelationships(),
  ])
  const kinds = Object.keys(KIND_LABELS).filter(
    (id) => filters.kind === 'all' || id === filters.kind,
  )
  const eligible = state.notices.filter(
    (o) =>
      kinds.includes(o.kind) &&
      (filters.side === 'all' || o.side === filters.side),
  )
  const verified = new Map<string, Opportunity>()
  const rejected = new Set<string>()
  async function hydrate(notices: StoredNotice[]) {
    if (!notices.length) return
    const rows = await hydrateBulletinNotices({ ...state, notices })
    const found = new Set(rows.map((o) => o.tweet_id))
    for (const o of notices)
      if (!found.has(o.tweet_id)) rejected.add(o.tweet_id)
    for (const o of rows) verified.set(o.tweet_id, o)
  }
  // A self-quote can renew an otherwise expired notice. Check those before
  // selecting the active page, so pagination never silently loses renewals.
  // Explicit deadlines cannot be renewed by self-quotes.
  // Full-text search deliberately checks every candidate, not just page one.
  const metadataOrder = sortNotices(
    eligible,
    filters.recommended,
    personal.account_id,
    personal,
    now,
  )
  const first = kinds.flatMap((kind) => {
    const rows = metadataOrder.filter(
      (o) => o.kind === kind && (filters.past || !isPast(o, now)),
    )
    const start = after ? rows.findIndex((o) => o.tweet_id === after) + 1 : 0
    return rows.slice(start, start + BULLETIN_PAGE_SIZE)
  })
  const preflight = new Map(
    [...eligible.filter((o) => !o.expires_at && isPast(o, now)), ...first].map(
      (o) => [o.tweet_id, o],
    ),
  )
  await hydrate(
    filters.search.trim()
      ? eligible
      : (Array.from(preflight.values()) as StoredNotice[]),
  )
  const candidates = sortNotices(
    eligible
      .map((o) => verified.get(o.tweet_id) || o)
      .filter(
        (o) =>
          !rejected.has(o.tweet_id) &&
          (filters.past || !isPast(o, now)) &&
          [o.summary, o.preview_text, o.username, o.place, ...o.topics]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(filters.search.trim().toLowerCase()),
      ),
    filters.recommended,
    personal.account_id,
    personal,
    now,
  )
  const counts: Record<string, number> = {}
  const cursors: Record<string, string | null> = {}
  const lanes = kinds.map((kind) => {
    const rows = candidates.filter((o) => o.kind === kind)
    const index = after ? rows.findIndex((o) => o.tweet_id === after) : -1
    if (after && index < 0)
      throw new BulletinCursorExpired('The board changed. Refresh to continue.')
    counts[kind] = rows.length
    return { kind, rows, position: index + 1, selected: [] as Opportunity[] }
  })
  // Fill holes from removed/edited posts without returning unverified summaries.
  while (
    lanes.some(
      (l) =>
        l.selected.length < BULLETIN_PAGE_SIZE && l.position < l.rows.length,
    )
  ) {
    const chunks = lanes.map((l) => ({
      lane: l,
      rows: l.rows.slice(
        l.position,
        l.position + BULLETIN_PAGE_SIZE - l.selected.length,
      ),
    }))
    await hydrate(
      chunks
        .flatMap((c) => c.rows)
        .filter(
          (o) => !verified.has(o.tweet_id) && !rejected.has(o.tweet_id),
        ) as StoredNotice[],
    )
    for (const { lane, rows } of chunks) {
      for (const row of rows) {
        const live = verified.get(row.tweet_id)
        if (live && (filters.past || !isPast(live, now)))
          lane.selected.push(live)
        else counts[lane.kind]--
      }
      lane.position += rows.length
    }
  }
  for (const lane of lanes)
    cursors[lane.kind] =
      lane.position < lane.rows.length
        ? lane.rows[lane.position - 1].tweet_id
        : null
  return {
    opportunities: lanes.flatMap((l) => l.selected),
    counts,
    cursors,
    total: state.notices.length,
    now,
    personal,
  }
}
