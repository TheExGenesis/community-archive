import type { ArchiveMediaItem } from './types'

export const PROFILE_MEDIA_PAGE_LIMIT = 24

export interface ProfileMediaPageState {
  media: ArchiveMediaItem[]
  mediaCount: number
  nextOffset: number | null
}
