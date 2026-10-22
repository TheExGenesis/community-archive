import { shelfTileKind } from './labels'
import type { Shelf, ShelfItem, ShelfRowKey } from './types'

/** Rows the bento grid shows as tiles; tools, links and mentions stay lists. */
export const BENTO_ROWS: ShelfRowKey[] = [
  'books',
  'reading',
  'watching',
  'listening',
  'playing',
  'made',
]
/** A work's own medium, never the member's own work, can be a favourite. */
const FAVOURITE_ROWS: ShelfRowKey[] = [
  'books',
  'reading',
  'watching',
  'listening',
  'playing',
]
export const FAVOURITE_LIMIT = 5
const FAVOURITES_PER_ROW = 2
// One tweet needs both loved and recommended; a single loved tweet is not a favourite.
const FAVOURITE_MIN_WEIGHT = 4
/**
 * Article links and YouTube videos are plentiful. Articles rank well below
 * other works with the same weight; videos a step below.
 */
const ARTICLE_PENALTY = 2.5
const VIDEO_PENALTY = 1
/**
 * What the member did with a work moves it up or down: something they read or
 * are playing outranks something they only cited, alluded to or linked.
 */
const RELATION_WEIGHT: Partial<
  Record<NonNullable<BentoItem['relation']>, number>
> = {
  experienced: 2,
  in_progress: 2,
  discussed: 1,
  intends: 0.5,
  cited: -0.5,
  referenced: -1,
  shared: -1,
  mentioned: -1,
}
/** Relations that never make a work a favourite. */
const NOT_FAVOURITE = new Set([
  'intends',
  'not_yet',
  'cited',
  'referenced',
  'shared',
  'mentioned',
])
/** Works this many other members tweeted about get a conversation tile. */
export const TALK_MIN_ECHOES = 3
/** Relations in which the member says what they did: read, watched, playing, means to. */
const CLAIMS = new Set(['experienced', 'in_progress', 'intends', 'not_yet'])
/**
 * A conversation tile needs the member's own part in it, a claim or a mark;
 * a passing mention of something many others tweeted about is not one.
 */
const tookPart = (item: BentoItem) =>
  (!!item.relation && CLAIMS.has(item.relation)) || item.marks.length > 0
const TALK_LIMIT = 4

export type BentoItem = Pick<
  ShelfItem,
  | 'workKey'
  | 'row'
  | 'medium'
  | 'label'
  | 'url'
  | 'marks'
  | 'needsTitle'
  | 'evidenceTweetIds'
  | 'lastAt'
  | 'coverPath'
  | 'imageSource'
  | 'echoAccountIds'
  | 'relation'
>

/** How much a member came back to a work: tweets, plus loved and recommended marks. */
export function shelfWeight(item: BentoItem) {
  return (
    item.evidenceTweetIds.length +
    (item.marks.includes('loved') ? 2 : 0) +
    (item.marks.includes('recommended') ? 1 : 0) -
    (item.marks.includes('disliked') ? 2 : 0)
  )
}

function isYouTube(url: string | null) {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, '')
    return host === 'youtube.com' || host === 'youtu.be'
  } catch {
    return false
  }
}

const isArticleLink = (item: BentoItem) => item.row === 'reading' && !!item.url

/** Order within the grid: weight, with article links and YouTube videos nudged down. */
export function bentoRank(item: BentoItem) {
  return (
    shelfWeight(item) +
    (item.relation ? (RELATION_WEIGHT[item.relation] ?? 0) : 0) -
    (isArticleLink(item)
      ? ARTICLE_PENALTY
      : isYouTube(item.url)
        ? VIDEO_PENALTY
        : 0)
  )
}

const byWeight = (a: BentoItem, b: BentoItem) =>
  bentoRank(b) - bentoRank(a) ||
  b.echoAccountIds.length - a.echoAccountIds.length ||
  Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
  a.workKey.localeCompare(b.workKey)

function bareSite(url: string | null) {
  if (!url) return false
  try {
    return new URL(url).pathname.replace(/\/+$/, '') === ''
  } catch {
    return false
  }
}

/** Handles and slugs ("curaffairs", "comm_archive") name accounts, not works. */
const looksLikeHandle = (label: string) =>
  /^@?[\w.-]+$/.test(label) &&
  (label === label.toLowerCase() || label.includes('_'))

/**
 * The works a member kept coming back to: most tweets, then loved and
 * recommended marks, a cover breaking ties; at most two per medium so the
 * favourites span what they read, watch and listen to.
 */
export function pickFavourites<T extends BentoItem>(
  items: T[],
  limit = FAVOURITE_LIMIT,
): T[] {
  const pool = items
    .filter(
      (item) =>
        FAVOURITE_ROWS.includes(item.row) &&
        !item.needsTitle &&
        !bareSite(item.url) &&
        !looksLikeHandle(item.label.trim()) &&
        !(item.relation && NOT_FAVOURITE.has(item.relation)) &&
        bentoRank(item) >= FAVOURITE_MIN_WEIGHT,
    )
    .sort(
      (a, b) =>
        bentoRank(b) +
          (b.coverPath ? 0.5 : 0) -
          (bentoRank(a) + (a.coverPath ? 0.5 : 0)) || byWeight(a, b),
    )
  const perRow = new Map<ShelfRowKey, number>()
  const out: T[] = []
  for (const item of pool) {
    const used = perRow.get(item.row) ?? 0
    if (used >= FAVOURITES_PER_ROW) continue
    perRow.set(item.row, used + 1)
    out.push(item)
    if (out.length === limit) break
  }
  return out
}

export type BentoTile<T extends BentoItem = BentoItem> = {
  kind: 'favourite' | 'talk' | 'work'
  item: T
  cols: 1 | 2
  rows: 1 | 2 | 3
}

function workSpan(item: BentoItem): Pick<BentoTile, 'cols' | 'rows'> {
  const kind = shelfTileKind(item)
  if (kind === 'book') return { cols: 1, rows: 2 }
  // Videos and pages lie wide only when they rank high; otherwise a square tile.
  return bentoRank(item) >= 4 ? { cols: 2, rows: 1 } : { cols: 1, rows: 1 }
}

/** A cover the tile can show; a site icon is not one. */
export const hasCover = (item: BentoItem) =>
  !!item.coverPath && item.imageSource !== 'favicon'

/**
 * Big tiles are for pictures. A work with no cover, and no tweet photo to fill
 * a tall tile, shrinks so it is not an empty box: a favourite or conversation
 * to one wide row, anything else to one cell.
 */
function fitToPicture<T extends BentoItem>(
  tile: BentoTile<T>,
  quotePhoto: (item: T) => boolean,
): BentoTile<T> {
  if (hasCover(tile.item) || (tile.rows > 1 && quotePhoto(tile.item)))
    return tile
  return {
    ...tile,
    ...(tile.kind === 'work'
      ? { cols: 1 as const, rows: 1 as const }
      : { cols: 2 as const, rows: 1 as const }),
  }
}

/**
 * One ranked grid. Favourites first in big tiles; works the most other
 * members tweeted about become conversation tiles placed between them; then
 * everything else by weight. Spans follow the medium's shape, so books stand
 * tall and videos lie wide, and only works with a picture get the big ones.
 * `quotePhoto` says which works have a photo in the member's quoted tweet.
 */
export function bentoTiles<T extends BentoItem>(
  items: T[],
  favourites: T[],
  quotePhoto: (item: T) => boolean = () => false,
): BentoTile<T>[] {
  const used = new Set(favourites.map((item) => item.workKey))
  const visible = items.filter((item) => BENTO_ROWS.includes(item.row))
  const talk = visible
    .filter(
      (item) =>
        !used.has(item.workKey) &&
        item.echoAccountIds.length >= TALK_MIN_ECHOES &&
        tookPart(item),
    )
    .sort(
      (a, b) =>
        b.echoAccountIds.length - a.echoAccountIds.length || byWeight(a, b),
    )
    .slice(0, TALK_LIMIT)
  talk.forEach((item) => used.add(item.workKey))

  const tiles: BentoTile<T>[] = favourites
    .filter((item) => visible.includes(item))
    .map((item, index) => ({
      kind: 'favourite',
      item,
      cols: 2,
      rows: index === 0 || shelfTileKind(item) === 'book' ? 3 : 2,
    }))
  talk.forEach((item, index) =>
    tiles.splice(Math.min(tiles.length, 1 + index * 2), 0, {
      kind: 'talk',
      item,
      cols: 2,
      rows: 2,
    }),
  )
  for (const item of visible.filter((i) => !used.has(i.workKey)).sort(byWeight))
    tiles.push({ kind: 'work', item, ...workSpan(item) })
  return tiles.map((tile) => fitToPicture(tile, quotePhoto))
}

export type ShelfChip = {
  key: string
  row: ShelfRowKey
  format: string | null
  count: number
}

/**
 * The medium chips, from the works present: a medium whose works split into
 * at least two formats of three or more works each (Movies, TV, Videos) gets
 * one chip per format; any other medium gets one chip.
 */
export function shelfChips(
  items: Pick<ShelfItem, 'row' | 'format'>[],
): ShelfChip[] {
  const chips: ShelfChip[] = []
  for (const row of BENTO_ROWS) {
    const inRow = items.filter((item) => item.row === row)
    if (!inRow.length) continue
    const byFormat = new Map<string, number>()
    for (const item of inRow)
      if (item.format)
        byFormat.set(item.format, (byFormat.get(item.format) ?? 0) + 1)
    const sizeable = Array.from(byFormat.values()).filter((n) => n >= 3).length
    if (row !== 'made' && sizeable >= 2 && inRow.every((item) => item.format)) {
      for (const [format, count] of Array.from(byFormat).sort(
        (a, b) => b[1] - a[1],
      ))
        chips.push({ key: `${row}:${format}`, row, format, count })
    } else chips.push({ key: row, row, format: null, count: inRow.length })
  }
  return chips
}

/** Twitter's snowflake epoch; ids from before it (late 2010) carry no time. */
const SNOWFLAKE_EPOCH = 1288834974657
const FIRST_SNOWFLAKE = BigInt('29700859247')

/** When a tweet was posted, read from its id; null for pre-snowflake ids. */
export function tweetTime(id: string) {
  if (!/^\d{1,20}$/.test(id)) return null
  const value = BigInt(id)
  if (value < FIRST_SNOWFLAKE) return null
  return Number(value >> BigInt(22)) + SNOWFLAKE_EPOCH
}

/** Times of a work's tweets, falling back to its first and last dates. */
export function tweetTimes(
  item: Pick<ShelfItem, 'evidenceTweetIds' | 'firstAt' | 'lastAt'>,
) {
  const times = item.evidenceTweetIds.flatMap((id) => tweetTime(id) ?? [])
  return times.length
    ? times
    : [Date.parse(item.firstAt), Date.parse(item.lastAt)]
}

export type ShelfPeriod = 'any' | 'recent' | number

/** Whether the member tweeted about a work in a period: a year, or the last 12 months. */
export function inPeriod(
  item: Pick<ShelfItem, 'evidenceTweetIds' | 'firstAt' | 'lastAt'>,
  period: ShelfPeriod,
  now = Date.now(),
) {
  if (period === 'any') return true
  const times = tweetTimes(item)
  if (period === 'recent')
    return times.some((t) => t >= now - 365 * 24 * 3600 * 1000)
  return times.some((t) => new Date(t).getUTCFullYear() === period)
}

/** Years that have tweets, newest first, with how many works each covers. */
export function shelfYears(
  items: Pick<ShelfItem, 'evidenceTweetIds' | 'firstAt' | 'lastAt'>[],
) {
  const counts = new Map<number, number>()
  for (const item of items)
    for (const year of Array.from(
      new Set(tweetTimes(item).map((t) => new Date(t).getUTCFullYear())),
    ))
      counts.set(year, (counts.get(year) ?? 0) + 1)
  return Array.from(counts, ([year, count]) => ({ year, count })).sort(
    (a, b) => b.year - a.year,
  )
}

const STAT_NOUNS: [ShelfRowKey, string, string][] = [
  ['books', 'book', 'books'],
  ['watching', 'video', 'videos'],
  ['reading', 'read', 'reads'],
  ['listening', 'listen', 'listens'],
  ['playing', 'game', 'games'],
  ['tools', 'tool', 'tools'],
]

/** "351 works · 43 books · 46 videos · … · since 2016", as parts. */
export function shelfStats(shelf: Shelf) {
  const items = shelf.rows.flatMap((row) => row.items)
  const works = items.filter((item) => BENTO_ROWS.includes(item.row))
  const parts: { count: number | null; text: string }[] = [
    { count: works.length, text: works.length === 1 ? 'work' : 'works' },
  ]
  for (const [row, one, many] of STAT_NOUNS) {
    const n = shelf.rows.find((r) => r.key === row)?.items.length ?? 0
    if (n) parts.push({ count: n, text: n === 1 ? one : many })
  }
  const since = items.map((item) => item.firstAt).sort()[0]
  if (since) parts.push({ count: null, text: `since ${since.slice(0, 4)}` })
  return parts
}
