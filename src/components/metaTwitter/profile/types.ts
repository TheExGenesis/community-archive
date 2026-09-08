import type {
  ArchiveMediaItem,
  ArchivePerson,
  BangerTweet,
} from '@/lib/metaTwitter/types'
import type { ProfileCurationSection } from '@/lib/profileCurationState'

export interface SidebarData {
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  available?: boolean
}

export interface MediaData {
  media: ArchiveMediaItem[]
  mediaCount: number
}

export interface PeopleData {
  people: ArchivePerson[]
}

export interface FeedState {
  tweets: BangerTweet[]
  total: number
  nextOffset: number | null
  available: boolean
}

export interface DismissedItem {
  itemId: string
  section: ProfileCurationSection
}
