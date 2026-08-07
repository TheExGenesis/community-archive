export interface PortalTweet {
  id: string
  username: string
  name: string
  avatar: string | null
  text: string
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

export interface PortalGauge {
  key: string
  label: string
  value: number
  tag: string
  color: string
  note: string
}

export interface PortalWeather {
  headline: string
  summary: string
  synopsis: string
  outlookText: string
  advisoriesText: string
  gauges: PortalGauge[]
  advisories: { title: string; body: string }[]
  outlook: { day: string; icon: string; text: string }[]
  issuedAt: string
}

export interface PortalData {
  stats: PortalStats
  trends: PortalTrends
  weather: PortalWeather
  initialStream: PortalTweet[]
}
