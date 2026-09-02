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

export const needsProfileTweetFallback = (
  page: Pick<ProfileBangersPageState, 'available' | 'total' | 'yearCounts'>,
  activeYear: number | null,
): boolean => {
  if (!page.available) return false
  const overallCount =
    activeYear === null
      ? page.total
      : page.yearCounts.reduce((total, chapter) => total + chapter.count, 0)
  return overallCount < PROFILE_BANGERS_INITIAL_LIMIT
}
