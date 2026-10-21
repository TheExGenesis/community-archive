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
  people: { username: string; avatar: string | null }[]
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
