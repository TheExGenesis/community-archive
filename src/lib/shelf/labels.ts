import type { ShelfItem, ShelfMark, ShelfRelation, ShelfRowKey } from './types'

/**
 * A member's name on their shelf: the display name as they wrote it, emoji
 * and all. Null when it is blank, so callers fall back to the handle.
 */
export function shelfOwnerName(displayName: string | null | undefined) {
  return displayName?.trim() || null
}

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
      return 'Wikipedia'
    case 'mentioned':
      return 'Also mentioned'
  }
}

export const SHELF_MARK_LABEL: Record<ShelfMark, string> = {
  loved: 'Loved',
  liked: 'Liked',
  recommended: 'Recommended',
  disliked: "Didn't like",
  hated: 'Hated',
}

type ClaimVerbs = Record<
  'experienced' | 'in_progress' | 'intends' | 'not_yet',
  string
>
const reading: ClaimVerbs = {
  experienced: 'Read',
  in_progress: 'Reading',
  intends: 'Wants to read',
  not_yet: "Hasn't read",
}
/** Verbs per medium. A medium not listed here gets GENERIC_VERBS, so new kinds of work need no change. */
const CLAIM_VERBS: Record<string, ClaimVerbs> = {
  books: reading,
  reading,
  watching: {
    experienced: 'Watched',
    in_progress: 'Watching',
    intends: 'Wants to watch',
    not_yet: "Hasn't watched",
  },
  listening: {
    experienced: 'Listened',
    in_progress: 'Listening',
    intends: 'Wants to listen',
    not_yet: "Hasn't listened",
  },
  playing: {
    experienced: 'Played',
    in_progress: 'Playing',
    intends: 'Wants to play',
    not_yet: "Hasn't played",
  },
  tools: {
    experienced: 'Used',
    in_progress: 'Uses',
    intends: 'Wants to try',
    not_yet: "Hasn't tried",
  },
}
const GENERIC_VERBS: ClaimVerbs = {
  experienced: 'Tried',
  in_progress: 'Into it',
  intends: 'Wants to try',
  not_yet: "Hasn't tried",
}
const OTHER_VERBS: Partial<Record<ShelfRelation, string>> = {
  discussed: 'Discussed',
  cited: 'Cited',
  referenced: 'Referenced',
  shared: 'Shared',
  mentioned: 'Mentioned',
}

/**
 * The one status a tile shows: a firsthand claim ("Read", "Watching") first,
 * then a recommendation, then the weaker relations ("Discussed", "Cited").
 * Null for the member's own work and before the flavor stage.
 */
export function shelfStatus(
  item: Pick<ShelfItem, 'relation' | 'medium' | 'row' | 'marks'>,
) {
  const claim =
    item.relation &&
    ['experienced', 'in_progress', 'intends', 'not_yet'].includes(item.relation)
  if (!claim && item.relation !== 'made' && item.marks.includes('recommended'))
    return 'Recommended'
  // Every work on a shelf is one the member talked about; saying so earns no tag.
  if (item.relation === 'discussed') return null
  return shelfVerb(item)
}

/** A YouTube link's video id, or null: watch?v=, youtu.be/, /shorts/, /embed/ and /live/ links. */
export function youtubeId(url: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^(www|m|music)\./, '')
    const id =
      host === 'youtu.be'
        ? parsed.pathname.slice(1).split('/')[0]
        : host === 'youtube.com' || host === 'youtube-nocookie.com'
          ? (parsed.searchParams.get('v') ??
            parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1])
          : null
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** What the member did with the work, as a verb for its medium; null when unknown or made. */
export function shelfVerb(
  item: Pick<ShelfItem, 'relation' | 'medium' | 'row'>,
) {
  const relation = item.relation
  if (!relation || relation === 'made') return null
  if (relation in OTHER_VERBS) return OTHER_VERBS[relation] ?? null
  const verbs =
    CLAIM_VERBS[item.medium] ?? CLAIM_VERBS[item.row] ?? GENERIC_VERBS
  return verbs[relation as keyof ClaimVerbs]
}

/** Chip labels for formats within a medium; unknown formats are capitalised as they come. */
export const SHELF_FORMAT_LABEL: Record<string, string> = {
  film: 'Movies',
  tv: 'TV',
  video: 'Videos',
  podcast: 'Podcasts',
  music: 'Music',
  audio: 'Audio',
}

export const shelfFormatLabel = (format: string) =>
  SHELF_FORMAT_LABEL[format] ?? format.charAt(0).toUpperCase() + format.slice(1)

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

/**
 * A work's permalink segment: its title in words, then the first 8 hex of
 * its cover key, which alone identifies it ("governing-the-commons-3f2a9c1e").
 */
export function shelfWorkSlug(item: Pick<ShelfItem, 'label' | 'key'>) {
  const words = item.label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '')
  const id = item.key.slice(0, 8)
  return words ? `${words}-${id}` : id
}

/** The cover-key prefix at the end of a work slug, or null. */
export function shelfWorkKeyPrefix(slug: string) {
  return slug.match(/(?:^|-)([0-9a-f]{8})$/)?.[1] ?? null
}

/** One letter for a coverless tile; the caption carries the full title. */
export function shelfMonogram(label: string) {
  const letter = label.match(/[\p{L}\p{N}]/u)?.[0]
  return (letter ?? label.trim().charAt(0) ?? '').toLocaleUpperCase('en-US')
}
