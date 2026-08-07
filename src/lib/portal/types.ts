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
}

export interface PortalStats {
  totalTweets: number
  totalLikes: number
  accountCount: number
  streamedToday: number
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
  /** Top-liked tweets from members' own archives, refreshed daily. */
  bangers: PortalTweet[]
}
