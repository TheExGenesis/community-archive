import type { ShelfItem, ShelfMark, ShelfRowKey } from './types'

export function shelfRowTitle(row: ShelfRowKey, ownerName: string | null) {
  switch (row) {
    case 'books':
      return 'Books'
    case 'reading':
      return 'Reading'
    case 'watching':
      return 'Watching'
    case 'listening':
      return 'Listening'
    case 'playing':
      return 'Playing'
    case 'tools':
      return 'Tools'
    case 'other':
      return 'Other'
    case 'made':
      return ownerName ? `Made by ${ownerName}` : 'Made by you'
    case 'links':
      return 'Links'
    case 'mentioned':
      return 'Also mentioned'
  }
}

export const SHELF_MARK_GLYPH: Record<ShelfMark, string> = {
  loved: '♥',
  recommended: '↗',
  disliked: '✕',
}

export const SHELF_MARK_LABEL: Record<ShelfMark, string> = {
  loved: 'Loved',
  recommended: 'Recommended',
  disliked: "Didn't like",
}

/** Rows shown as a wall of covers; the rest are compact lists. */
export const COVER_ROWS: ShelfRowKey[] = [
  'books',
  'reading',
  'watching',
  'listening',
  'playing',
  'tools',
  'other',
  'made',
]

/** Cover box per row, in px. Everything stands on the same ledge. */
export const SHELF_COVER_SIZE: Record<ShelfRowKey, { w: number; h: number }> = {
  books: { w: 116, h: 174 },
  reading: { w: 176, h: 132 },
  watching: { w: 232, h: 130 },
  listening: { w: 150, h: 150 },
  playing: { w: 124, h: 166 },
  tools: { w: 120, h: 120 },
  other: { w: 132, h: 150 },
  made: { w: 176, h: 132 },
  links: { w: 64, h: 64 },
  mentioned: { w: 64, h: 64 },
}

/** A stable hue per work, so fallback tiles differ but never change. */
export function shelfTileHue(workKey: string) {
  let hash = 0
  for (let i = 0; i < workKey.length; i += 1)
    hash = (hash * 31 + workKey.charCodeAt(i)) >>> 0
  return hash % 360
}

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

export function shelfSpan(item: Pick<ShelfItem, 'firstAt' | 'lastAt'>) {
  const first = monthYear(item.firstAt)
  const last = monthYear(item.lastAt)
  return first === last ? first : `${first} to ${last}`
}

export function shelfTweetCount(item: Pick<ShelfItem, 'evidenceTweetIds'>) {
  const n = item.evidenceTweetIds.length
  return n > 1 ? `×${n} tweets` : null
}

export function shelfHost(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The object a coverless tile is drawn as. */
export type ShelfTileKind =
  | 'book'
  | 'page'
  | 'screen'
  | 'record'
  | 'game'
  | 'app'
  | 'card'

const TILE_KIND: Record<string, ShelfTileKind> = {
  books: 'book',
  book: 'book',
  reading: 'page',
  watching: 'screen',
  listening: 'record',
  playing: 'game',
  tools: 'app',
}

/**
 * The medium decides the object, so a tool in "Made by" still looks like a
 * tool. Unknown media fall back to the row, then to an index card.
 */
export function shelfTileKind(item: Pick<ShelfItem, 'medium' | 'row'>) {
  return TILE_KIND[item.medium] ?? TILE_KIND[item.row] ?? 'card'
}

/** One letter for a coverless tile; the caption carries the full title. */
export function shelfMonogram(label: string) {
  const letter = label.match(/[\p{L}\p{N}]/u)?.[0]
  return (letter ?? label.trim().charAt(0) ?? '').toLocaleUpperCase('en-US')
}
