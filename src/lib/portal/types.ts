export interface PortalMedia {
  url: string
  type: string
  width?: number
  height?: number
}

export interface PortalQuotedTweet {
  id: string
  username: string
  name: string
  avatar: string | null
  text: string
  createdAt: string
  likes: number
  rts: number
  media: PortalMedia[]
  isDeleted?: boolean
}

export interface PortalTweet {
  id: string
  username: string
  name: string
  avatar: string | null
  text: string
  /** When the archive observed or last refreshed this tweet. */
  observedAt: string
  /** When the tweet was authored on Twitter/X. */
  createdAt: string
  likes: number
  rts: number
  /** Latest ClickHouse follower observation, used only for homepage ranking. */
  followers?: number
  media?: PortalMedia[]
  quotedTweet?: PortalQuotedTweet
  /** Distinct non-self quote tweets from archive uploaders and opt-ins. */
  quoteCount?: number
}

export type PortalBangersScope = 'all' | 'members'
export type PortalBangersSort = 'quotes' | 'recent'
export type PortalBangersPeriod = 'today' | 'week'

export interface PortalBangersPagination {
  limit: number
  offset: number
  nextOffset: number | null
  totalAvailable: number
  snapshotSize: number
  yearCounts: Array<{ year: number; count: number }>
  candidateRankingTruncated: boolean
}

export interface PortalBangersPage {
  tweets: PortalTweet[]
  pagination: PortalBangersPagination
}

export interface PortalStats {
  totalTweets: number
  accountCount: number
  streamedLast24Hours: number
  joinedThisWeek: number
  firstYear: number
  currentYear: number
  generatedAt: string
}

export interface TermWeek {
  term: string
  last7: number
  prev7: number
  deltaPct: number | null
  status: 'comparable' | 'new' | 'inactive'
}

export interface TermSeries {
  term: string
  color: string
  /** raw matching tweet counts, one entry per year */
  tweetsPerYear: number[]
  /** occurrences per 100k tweets, one entry per year */
  perYear: number[]
}

export interface PortalTrends {
  years: number[]
  series: TermSeries[]
  weekly: TermWeek[]
  computedAt: string
}

/** Source of the research feed shown on the portal Home and /research. */
export const RESEARCH_SOURCE = {
  name: 'epistemic garden',
  url: 'https://xiqo.substack.com',
}

export interface ResearchPost {
  title: string
  url: string
  date: string
  excerpt: string
  image: string | null
  author: string | null
}

export interface PortalData {
  stats: PortalStats
  trends: PortalTrends
  initialStream: PortalTweet[]
  research: ResearchPost[]
  /** Fresh ClickHouse-ranked posts from current members, refreshed every 30m. */
  recentBangers: PortalTweet[]
  /** Calendar-matched canonical bangers, refreshed daily. */
  historicalBangers: PortalTweet[]
  /** Request failures are carried to the client so only their panels degrade. */
  failures: {
    liveAnalytics: boolean
    memberCount: boolean
    joinedThisWeek: boolean
    corpusRange: boolean
    trends: boolean
    initialStream: boolean
    research: boolean
    recentBangers: boolean
    historicalBangers: boolean
  }
}
