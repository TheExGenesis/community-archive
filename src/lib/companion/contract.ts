/** Browser-safe v1 contract. Synced into the extension by sync-companion-contract.mjs. */
export const COMPANION_VERSION = 1 as const
export const FEATURES = [
  'bangers',
  'digest',
  'trends',
  'search',
  'graph',
] as const
export type Feature = (typeof FEATURES)[number]
export type ArchiveInput = {
  feature: Feature
  q?: string
  username?: string
  period?: 'all' | 'week' | 'today' | 'three-months'
  graphWindow?: 'recent'
  granularity?: 'year' | 'month' | 'week' | 'day'
  offset?: number
  date?: string
}
export type ArchiveTweet = {
  id: string
  username: string
  name: string
  text: string
  createdAt: string
  likes: number
  rts: number
  quoteCount?: number
  media?: { url: string; type: string; width?: number; height?: number }[]
  quotedTweet?: {
    id: string
    username: string
    name: string
    text: string
    media: { url: string; type: string }[]
    isDeleted?: boolean
  }
}
export type TweetPage = { tweets: ArchiveTweet[]; nextOffset: number | null }
export type DigestStory = {
  slug: string
  title: string
  subtitle: string
  category: string
  bullets: string[]
  tweets: ArchiveTweet[]
  href: string
  relevant: boolean
}
export type DigestData = {
  date: string | null
  summary: string[]
  stories: DigestStory[]
  preview: boolean
  matched: boolean
}
export type TrendingWord = {
  term: string
  lane?: 'emerging' | 'rising' | 'falling'
  posts: number
  changePct: number | null
  since?: string
  until?: string
}
export type TrendData = {
  /** Present for the default weekly discovery view (no query). */
  words?: TrendingWord[]
  term: string
  granularity: string
  buckets: string[]
  counts: number[]
  per100k: number[]
  computedAt: string
  evidence: ArchiveTweet[]
}
export type GraphPerson = { id: string; username: string; name: string }
export type GraphData = {
  focus: GraphPerson | null
  neighbors: (GraphPerson & {
    strength: number
    interactions: number
    lastInteractionAt?: string
  })[]
  generatedAt: string
  timeWindow: string
  days?: number
  truncated: boolean
}
export type ArchivePayloads = {
  bangers: TweetPage
  search: TweetPage
  digest: DigestData
  trends: TrendData
  graph: GraphData
}
export type ArchiveResult<F extends Feature = Feature> = F extends Feature
  ? {
      version: typeof COMPANION_VERSION
      feature: F
      data: ArchivePayloads[F]
      href: string
      explanation: string
    }
  : never

export function archiveHref(input: ArchiveInput): string {
  const p = new URLSearchParams()
  switch (input.feature) {
    case 'bangers':
      if (input.username) return `/user/${encodeURIComponent(input.username)}`
      p.set('period', input.period || 'week')
      if (input.q) p.set('q', input.q)
      return `/bangers?${p}`
    case 'digest':
      return `/digest${input.date ? `/${input.date}` : ''}`
    case 'trends':
      if (input.q) p.set('q', input.q)
      p.set('granularity', input.granularity || 'month')
      return `/trends?${p}`
    case 'search':
      if (input.q) p.set('q', input.q)
      if (input.username) p.set('fromUser', input.username)
      return `/search?${p}`
    case 'graph':
      if (input.username) p.set('person', input.username)
      return `/social-graph${p.size ? `?${p}` : ''}`
  }
}

export function archiveRequestPath(input: ArchiveInput): string {
  const p = new URLSearchParams()
  for (const key of [
    'q',
    'username',
    'period',
    'granularity',
    'graphWindow',
    'offset',
    'date',
  ] as const) {
    if (input[key] !== undefined && input[key] !== '')
      p.set(key, String(input[key]))
  }
  return `/api/companion/v1/${input.feature}${p.size ? `?${p}` : ''}`
}

export function parseArchiveInput(
  feature: string,
  params: URLSearchParams,
): ArchiveInput {
  if (!FEATURES.includes(feature as Feature))
    throw new Error('Unknown archive feature')
  const q = (params.get('q') || '').trim()
  const username = (params.get('username') || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
  if (q.length > 120)
    throw new Error('Choose a query of 120 characters or fewer')
  if (username && !/^[a-z0-9_]{1,15}$/.test(username))
    throw new Error('Choose a valid Twitter username')
  const offset = params.get('offset') || '0'
  if (!/^\d+$/.test(offset) || Number(offset) > 1000)
    throw new Error('Choose a page offset between 0 and 1000')
  const period = params.get('period') || 'week'
  if (!['all', 'week', 'today', 'three-months'].includes(period))
    throw new Error('Choose a valid bangers period')
  const granularity = params.get('granularity') || 'month'
  if (!['year', 'month', 'week', 'day'].includes(granularity))
    throw new Error('Choose a valid trend interval')
  const graphWindow = params.get('graphWindow') || ''
  if (graphWindow && graphWindow !== 'recent')
    throw new Error('Choose a valid graph window')
  const date = params.get('date') || ''
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new Error('Choose a valid digest date')
  if (feature === 'search' && !q) throw new Error('Enter a topic to explore')
  if (feature === 'trends' && q.length > 80)
    throw new Error('Choose a trend term of 80 characters or fewer')
  return {
    feature: feature as Feature,
    q,
    username,
    offset: Number(offset),
    period: period as ArchiveInput['period'],
    granularity: granularity as ArchiveInput['granularity'],
    ...(date ? { date } : {}),
    ...(graphWindow ? { graphWindow: 'recent' as const } : {}),
  }
}
