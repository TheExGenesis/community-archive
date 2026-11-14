/** Data contract and list logic for /library (CA Library). */

export const LIBRARY_DATA_URL = '/api/library'
export const libraryShardUrl = (n: number) => `/api/library/shard/${n}`

export type LibraryKind =
  | 'essay'
  | 'book'
  | 'film'
  | 'video'
  | 'paper'
  | 'wiki'
  | 'music'
  | 'podcast'
  | 'site'
  | 'code'

export interface LibraryWork {
  id: string
  k: LibraryKind
  /** Title. */
  t: string
  /** Author, channel or site. */
  s: string
  /** Short description, when the source gave one. */
  d: string
  /** Where the work lives; a site path for videos, which open in CA Tube. */
  u: string
  /** Distinct members who tweeted about it. */
  n: number
  /** Tweets about it. */
  tw: number
  /** Likes summed over those tweets (a sample of them for named works). */
  l: number
  /** First and last tweet, epoch seconds. */
  f: number
  la: number
  /** Found by a shared link, or by the title written out. */
  by: 'link' | 'name'
}

export interface LibraryData {
  /** ISO time of the weekly build. */
  generatedAt: string
  generated: number
  shards: number
  minMembers: number
  works: LibraryWork[]
}

export interface LibraryTweet {
  i: string
  u: string
  f: number
  x: string
  c: number
}

export interface LibraryDetail {
  who: string[]
  top: LibraryTweet[]
}

/** Shelf order and labels: plural for the tabs, singular for a work's tag. */
export const LIBRARY_KINDS: [LibraryKind, string, string][] = [
  ['essay', 'Essays & posts', 'Essay'],
  ['book', 'Books', 'Book'],
  ['film', 'Films & TV', 'Film'],
  ['video', 'Videos', 'Video'],
  ['paper', 'Papers', 'Paper'],
  ['wiki', 'Ideas', 'Idea'],
  ['music', 'Music', 'Music'],
  ['podcast', 'Podcasts', 'Podcast'],
  ['site', 'Sites & tools', 'Site'],
  ['code', 'Code', 'Code'],
]

export type LibrarySort = 'members' | 'likes' | 'recent' | 'oldest'

export const LIBRARY_SORTS: [LibrarySort, string][] = [
  ['members', 'Most members'],
  ['likes', 'Most liked'],
  ['recent', 'Tweeted most recently'],
  ['oldest', 'Oldest first'],
]

export interface LibraryFilters {
  kind: LibraryKind | ''
  q: string
  sort: LibrarySort
}

/**
 * Mirrors the shard function of the weekly worker and the query gateway
 * (control-panel repository, ops/clickhouse-library and
 * ops/clickhouse-query-gateway/library.mjs).
 */
export function libraryShard(id: string, shards: number): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % shards
  return h
}

export function filtersFromParams(params: URLSearchParams): LibraryFilters {
  const kind = params.get('kind')
  const sort = params.get('sort')
  return {
    kind: LIBRARY_KINDS.some(([k]) => k === kind) ? (kind as LibraryKind) : '',
    q: params.get('q') ?? '',
    sort: LIBRARY_SORTS.some(([s]) => s === sort)
      ? (sort as LibrarySort)
      : 'members',
  }
}

export function filtersToQuery(f: LibraryFilters): string {
  const p = new URLSearchParams()
  if (f.kind) p.set('kind', f.kind)
  if (f.q) p.set('q', f.q)
  if (f.sort !== 'members') p.set('sort', f.sort)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function countByKind(works: LibraryWork[]): Map<LibraryKind, number> {
  const counts = new Map<LibraryKind, number>()
  for (const w of works) counts.set(w.k, (counts.get(w.k) ?? 0) + 1)
  return counts
}

export function selectWorks(
  works: LibraryWork[],
  f: LibraryFilters,
): LibraryWork[] {
  const q = f.q.trim().toLowerCase()
  const out = works.filter(
    (w) =>
      (!f.kind || w.k === f.kind) &&
      (!q || `${w.t} ${w.s} ${w.d}`.toLowerCase().includes(q)),
  )
  const by: Record<LibrarySort, (a: LibraryWork, b: LibraryWork) => number> = {
    members: (a, b) => b.n - a.n || b.l - a.l,
    likes: (a, b) => b.l - a.l || b.n - a.n,
    recent: (a, b) => b.la - a.la,
    oldest: (a, b) => a.f - b.f,
  }
  return out.sort(by[f.sort])
}

/** "2014" or "2014–2026": the years a work was tweeted about. */
export function yearSpan(w: LibraryWork): string {
  const a = new Date(w.f * 1000).getUTCFullYear()
  const b = new Date(w.la * 1000).getUTCFullYear()
  return a === b ? `${a}` : `${a}–${b}`
}
