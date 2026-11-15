import type { PortalTweet } from '@/lib/portal/types'
export interface MapStory {
  id: string
  kind: 'digest' | 'strand'
  title: string
  subtitle: string
  date: string
  category: string
  href: string
  totalPosts?: number
  people: { username: string; avatar: string | null; cell?: number }[]
  cells: number[]
  country?: string
  origin?: number
}
export interface StoryPage {
  editions: {
    date: string
    isPreview?: boolean
    headline: string
    stories: MapStory[]
  }[]
  stories: MapStory[]
  nextOffset: number | null
  countryFallback?: boolean
  located: boolean
}
export interface StoryDetail {
  tweets: {
    tweet: PortalTweet
    annotation?: string
    cell?: number
    memberQuotes?: number
  }[]
}

export interface MapPostPage extends StoryDetail {
  nextOffset: number | null
}

/** A Week in Review story, opened on the map as its daily stories. */
export interface WeeklyMapStory {
  id: string
  title: string
  subtitle: string
  href: string
  /** Digest days the story appeared on, ascending. */
  days: string[]
  /** The daily digest stories it weaves together, oldest first. */
  stories: MapStory[]
}

/** The current Week in Review: the running week so far, else the last final week. */
export interface WeeklyMapPage {
  weekStart: string
  weekEnd: string
  soFar: boolean
  /** Last digest day a week-so-far edition covers. */
  throughDate?: string
  stories: WeeklyMapStory[]
  located: boolean
}
