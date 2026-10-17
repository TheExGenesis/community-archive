import {
  SHELF_MARKS,
  SHELF_ROWS,
  SHELF_STATUSES,
  type Shelf,
  type ShelfItem,
  type ShelfMark,
  type ShelfRow,
  type ShelfRowKey,
  type ShelfStatus,
} from './types'

/** A row as returned by public.get_shelf. */
export interface ShelfDbRow {
  work_key: string
  shelf_row: string
  medium: string
  label: string
  needs_title: boolean
  creator: string | null
  url: string | null
  marks: string[] | null
  evidence_tweet_ids: string[] | null
  first_at: string
  last_at: string
  image_url: string | null
  image_source: string | null
  status: string
  computed_at: string
}

export const ACCOUNT_ID_PATTERN = /^\d{1,20}$/
const TWEET_ID_PATTERN = /^\d{1,20}$/

export function isWorkKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 300
}

/**
 * Cover image key: a short hex digest of the work key, so cover URLs never
 * carry titles and the proxy only resolves keys the shelf itself returned.
 */
export type CoverKeyFn = (workKey: string) => string

export function coverPath(
  accountId: string,
  key: string,
  imageUrl: string | null,
  coverKey: CoverKeyFn,
) {
  if (!imageUrl || !/^https:\/\//i.test(imageUrl)) return null
  // v changes when the resolved image changes, so long cache lifetimes are safe.
  const params = new URLSearchParams({
    account_id: accountId,
    key,
    v: coverKey(imageUrl).slice(0, 8),
  })
  return `/api/shelf/cover?${params}`
}

function safeHttpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/** Map one database row; returns null for rows outside the contract. */
export function mapShelfRow(
  accountId: string,
  row: ShelfDbRow,
  coverKey: CoverKeyFn,
): ShelfItem | null {
  if (!isWorkKey(row.work_key)) return null
  if (!(SHELF_ROWS as readonly string[]).includes(row.shelf_row)) return null
  const status: ShelfStatus = (SHELF_STATUSES as readonly string[]).includes(
    row.status,
  )
    ? (row.status as ShelfStatus)
    : 'pending'
  const marks = Array.from(
    new Set(
      (row.marks ?? []).filter((mark): mark is ShelfMark =>
        (SHELF_MARKS as readonly string[]).includes(mark),
      ),
    ),
  ).sort((a, b) => SHELF_MARKS.indexOf(a) - SHELF_MARKS.indexOf(b))
  const evidenceTweetIds = Array.from(
    new Set(
      (row.evidence_tweet_ids ?? []).filter((id) => TWEET_ID_PATTERN.test(id)),
    ),
  )
  const key = coverKey(row.work_key)
  return {
    workKey: row.work_key,
    key,
    row: row.shelf_row as ShelfRowKey,
    medium: row.medium,
    label: row.label?.trim() || row.work_key,
    needsTitle: row.needs_title === true,
    creator: row.creator?.trim() || null,
    url: safeHttpUrl(row.url),
    marks,
    evidenceTweetIds,
    firstAt: row.first_at,
    lastAt: row.last_at,
    coverPath: coverPath(accountId, key, row.image_url, coverKey),
    imageSource: row.image_source,
    status,
  }
}

/**
 * Within a row: works with more evidence first, then the most recent. Each
 * work appears once even if the source returned it twice.
 */
export function groupShelf(accountId: string, items: ShelfItem[]): Shelf {
  const seen = new Set<string>()
  const byRow = new Map<ShelfRowKey, ShelfItem[]>()
  for (const item of items) {
    if (seen.has(item.workKey)) continue
    seen.add(item.workKey)
    const list = byRow.get(item.row) ?? []
    list.push(item)
    byRow.set(item.row, list)
  }
  const rows: ShelfRow[] = []
  for (const key of SHELF_ROWS) {
    const list = byRow.get(key)
    if (!list?.length) continue
    list.sort(
      (a, b) =>
        b.evidenceTweetIds.length - a.evidenceTweetIds.length ||
        Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
        a.workKey.localeCompare(b.workKey),
    )
    rows.push({ key, items: list })
  }
  return { accountId, rows, total: seen.size }
}

export function shapeShelf(
  accountId: string,
  rows: ShelfDbRow[],
  coverKey: CoverKeyFn,
): Shelf {
  return groupShelf(
    accountId,
    rows.flatMap((row) => mapShelfRow(accountId, row, coverKey) ?? []),
  )
}
