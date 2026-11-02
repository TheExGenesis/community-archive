/** Data contract and recommendation logic for /tube (CA Tube). */

export const TUBE_DATA_URL = '/tube/videos.json'

export interface TubeVideo {
  id: string
  title: string
  channel: string
  /** Distinct accounts that shared the video. */
  n: number
  /** Likes summed over every sharing tweet. */
  likes: number
  /** First and last share, epoch seconds. */
  first: number
  last: number
  /** Indexes of the most similar videos, by overlap of sharing accounts. */
  nb: number[]
  /** LLM enrichment; absent until scripts/tube/enrich.py has run. */
  type?: string
  cat?: string
  sub?: string
  tags?: string[]
  ev?: boolean
}

export interface TubeData {
  generated: number
  shards: number
  videos: TubeVideo[]
}

/** One archived tweet that shared a video, shown as a comment. */
export interface TubeComment {
  t: string
  u: string
  n: string
  av: string
  x: string
  f: number
  c: number
  ru: string | null
  st: 'strong' | 'rec' | 'ref' | 'neg' | null
}

export interface TubeDetail {
  summary: string | null
  why: string | null
  comments: TubeComment[]
}

/** Per-browser state; never leaves localStorage. */
export interface TubeState {
  /** Most recent last. */
  history: { id: string; at: number }[]
  liked: string[]
  disliked: string[]
  later: string[]
  frames: boolean
}

export const EMPTY_TUBE_STATE: TubeState = {
  history: [],
  liked: [],
  disliked: [],
  later: [],
  frames: true,
}

/** Mirrors shard() in scripts/tube/build-tube-data.py. */
export function tubeShard(id: string, shards: number): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % shards
  return h
}

/**
 * hq2 is YouTube's automatic frame from the middle of the video; mqdefault is
 * the uploader's thumbnail.
 */
export function tubeThumbnail(id: string, frames: boolean): string {
  return `https://i.ytimg.com/vi/${id}/${frames ? 'hq2' : 'mqdefault'}.jpg`
}

export type TubeSort = 'best' | 'shared' | 'recent' | 'oldest' | 'likes'

export interface TubeFilters {
  q: string
  sort: TubeSort
  era: '' | 'year' | '2020s' | '2010s'
  type: string
  cat: string
  sub: string
  gems: boolean
  evergreen: boolean
}

export const EMPTY_TUBE_FILTERS: TubeFilters = {
  q: '',
  sort: 'best',
  era: '',
  type: '',
  cat: '',
  sub: '',
  gems: false,
  evergreen: false,
}

/** Shared by only a few accounts, but loved where it was shared. */
export function isHiddenGem(v: TubeVideo): boolean {
  return v.n <= 3 && v.likes / v.n >= 20
}

export function filtersFromParams(params: URLSearchParams): TubeFilters {
  const sort = params.get('sort') as TubeSort | null
  const era = params.get('era')
  return {
    q: params.get('q') ?? '',
    sort:
      sort && ['best', 'shared', 'recent', 'oldest', 'likes'].includes(sort)
        ? sort
        : 'best',
    era: era === 'year' || era === '2020s' || era === '2010s' ? era : '',
    type: params.get('type') ?? '',
    cat: params.get('cat') ?? '',
    sub: params.get('sub') ?? '',
    gems: params.get('gems') === '1',
    evergreen: params.get('evergreen') === '1',
  }
}

export function filtersToQuery(f: TubeFilters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.sort !== 'best') p.set('sort', f.sort)
  if (f.era) p.set('era', f.era)
  if (f.type) p.set('type', f.type)
  if (f.cat) p.set('cat', f.cat)
  if (f.sub) p.set('sub', f.sub)
  if (f.gems) p.set('gems', '1')
  if (f.evergreen) p.set('evergreen', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * "Best" walks the similarity graph out from liked (weight 3) and watched
 * (weight 1) videos, pushing disliked neighbourhoods down; with no history it
 * is a popularity-weighted shuffle so the first visit still varies.
 */
function personalScores(data: TubeData, state: TubeState): Map<number, number> {
  const index = new Map(data.videos.map((v, i) => [v.id, i]))
  const score = new Map<number, number>()
  const spread = (ids: string[], weight: number) => {
    ids.slice(-50).forEach((id, k, arr) => {
      const i = index.get(id)
      if (i === undefined) return
      const recency = 0.5 + (0.5 * (k + 1)) / arr.length
      data.videos[i].nb.forEach((j, rank) => {
        score.set(j, (score.get(j) ?? 0) + (weight * recency) / (1 + rank * 0.25))
      })
    })
  }
  spread(state.liked, 3)
  spread(state.history.map((h) => h.id), 1)
  spread(state.disliked, -2)
  return score
}

export function rankTube(
  data: TubeData,
  state: TubeState,
  f: TubeFilters,
  seed: number,
): TubeVideo[] {
  const disliked = new Set(state.disliked)
  const watched = new Set(state.history.map((h) => h.id))
  const q = f.q.trim().toLowerCase()
  const now = data.generated
  const matches = (v: TubeVideo) =>
    !disliked.has(v.id) &&
    (!q ||
      v.title.toLowerCase().includes(q) ||
      v.channel.toLowerCase().includes(q) ||
      (v.tags ?? []).some((t) => t.includes(q))) &&
    (!f.type || v.type === f.type) &&
    (!f.cat || v.cat === f.cat) &&
    (!f.sub || v.sub === f.sub) &&
    (!f.gems || isHiddenGem(v)) &&
    (!f.evergreen || v.ev === true) &&
    (!f.era ||
      (f.era === 'year' && v.last >= now - 365 * 86400) ||
      (f.era === '2020s' && v.first >= 1577836800) ||
      (f.era === '2010s' && v.first >= 1262304000 && v.first < 1577836800))

  const list = data.videos.filter(matches)
  switch (f.sort) {
    case 'shared':
      return list
    case 'recent':
      return list.sort((a, b) => b.last - a.last)
    case 'oldest':
      return list.sort((a, b) => a.first - b.first)
    case 'likes':
      return list.sort((a, b) => b.likes / b.n - a.likes / a.n)
  }
  const rand = mulberry32(seed)
  const index = new Map(data.videos.map((v, i) => [v.id, i]))
  const personal = personalScores(data, state)
  return list
    .map((v) => {
      const base = Math.log(1 + v.n) * (0.4 + rand())
      const p = (personal.get(index.get(v.id) ?? -1) ?? 0) * 2
      const seen = watched.has(v.id) ? 0.15 : 1
      return { v, s: (base + p) * seen }
    })
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => v)
}

export function upNext(
  data: TubeData,
  video: TubeVideo,
  state: TubeState,
): TubeVideo[] {
  const disliked = new Set(state.disliked)
  const watched = new Set(state.history.map((h) => h.id))
  const nb = data.videos.length
    ? video.nb.map((i) => data.videos[i]).filter((v) => !disliked.has(v.id))
    : []
  return [
    ...nb.filter((v) => !watched.has(v.id)),
    ...nb.filter((v) => watched.has(v.id)),
  ]
}

export function timeAgo(epoch: number, now = Date.now() / 1000): string {
  const days = Math.max(0, (now - epoch) / 86400)
  if (days < 1) return 'today'
  if (days < 30) return `${Math.floor(days)} day${days < 2 ? '' : 's'} ago`
  if (days < 365) {
    const m = Math.floor(days / 30)
    return `${m} month${m === 1 ? '' : 's'} ago`
  }
  const y = Math.floor(days / 365)
  return `${y} year${y === 1 ? '' : 's'} ago`
}
