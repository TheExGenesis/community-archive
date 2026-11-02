/** Data contract and recommendation logic for /tube (CA Tube). */

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
  /** Example shares: [tweet id, username, likes]. */
  ex: [string, string, number][]
  /** Indexes of the most similar videos, by overlap of sharing accounts. */
  nb: number[]
}

export interface TubeData {
  generated: number
  videos: TubeVideo[]
}

/** Per-browser state; never leaves localStorage. */
export interface TubeState {
  watched: string[]
  liked: string[]
  hidden: string[]
}

export const EMPTY_TUBE_STATE: TubeState = { watched: [], liked: [], hidden: [] }

export type TubeTab = 'foryou' | 'top' | 'recent' | 'deep'

/** A frame from the middle of the video, not the uploader's thumbnail. */
export function tubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hq2.jpg`
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
 * Ranks the catalogue for one tab. "For you" walks the similarity graph out
 * from liked (weight 3) and watched (weight 1) videos; with no history it is a
 * popularity-weighted shuffle so the first visit still varies.
 */
export function rankTube(
  data: TubeData,
  state: TubeState,
  tab: TubeTab,
  seed: number,
): TubeVideo[] {
  const { videos } = data
  const hidden = new Set(state.hidden)
  const watched = new Set(state.watched)
  const visible = (v: TubeVideo) => !hidden.has(v.id)

  if (tab === 'top') return videos.filter(visible)
  if (tab === 'recent') {
    return videos.filter(visible).sort((a, b) => b.last - a.last)
  }
  if (tab === 'deep') {
    return videos
      .filter((v) => visible(v) && v.n <= 3)
      .sort((a, b) => b.likes / b.n - a.likes / a.n)
  }

  const rand = mulberry32(seed)
  const index = new Map(videos.map((v, i) => [v.id, i]))
  const score = new Map<number, number>()
  const spread = (ids: string[], weight: number) => {
    // Most recent interactions count most.
    ids.slice(-50).forEach((id, k, arr) => {
      const i = index.get(id)
      if (i === undefined) return
      const recency = 0.5 + (0.5 * (k + 1)) / arr.length
      videos[i].nb.forEach((j, rank) => {
        score.set(j, (score.get(j) ?? 0) + (weight * recency) / (1 + rank * 0.25))
      })
    })
  }
  spread(state.liked, 3)
  spread(state.watched, 1)

  return videos
    .map((v, i) => {
      const base = Math.log(1 + v.n) * (0.4 + rand())
      const personal = (score.get(i) ?? 0) * 2
      const seen = watched.has(v.id) ? 0.15 : 1
      return { v, s: (base + personal) * seen }
    })
    .filter(({ v }) => visible(v))
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => v)
}

export function upNext(
  data: TubeData,
  video: TubeVideo,
  state: TubeState,
): TubeVideo[] {
  const hidden = new Set(state.hidden)
  const watched = new Set(state.watched)
  const nb = video.nb.map((i) => data.videos[i]).filter((v) => !hidden.has(v.id))
  return [
    ...nb.filter((v) => !watched.has(v.id)),
    ...nb.filter((v) => watched.has(v.id)),
  ]
}
