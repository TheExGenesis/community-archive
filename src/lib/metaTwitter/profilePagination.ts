import type { BangerTweet } from './types'

export const PROFILE_BANGERS_INITIAL_LIMIT = 2
export const PROFILE_BANGERS_PAGE_LIMIT = 10
export const PROFILE_BANGERS_PRELOAD_LIMIT = 2

export type ProfileBangerSort = 'quotes' | 'likes' | 'newest'

export interface ProfileBangersPageState {
  tweets: BangerTweet[]
  yearCounts: { year: number; count: number }[]
  total: number
  nextOffset: number | null
  available: boolean
}

export const resolveProfileChapterYear = (
  candidateYear: number | null,
  page: Pick<ProfileBangersPageState, 'available' | 'yearCounts'>,
): number | null => {
  if (candidateYear === null) return null
  if (!page.available) return candidateYear
  return page.yearCounts.some((entry) => entry.year === candidateYear)
    ? candidateYear
    : null
}

/**
 * Rows read per latest-posts page (the gateway's own-tweets maximum).
 * Retweets are dropped after the read, so a page can show fewer.
 */
export const PROFILE_TIMELINE_PAGE_LIMIT = 50
/** The gateway's own-tweets read stops paging at this offset. */
export const PROFILE_TIMELINE_MAX_OFFSET = 10_000

/** `original` hides replies, like the Posts tab on X; `all` includes them. */
export type ProfileTimelineKind = 'original' | 'all'
