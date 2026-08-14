import 'server-only'

import { cache } from 'react'
import { getClickHouseUserProfile } from '@/lib/clickhouseUserProfile'
import { getProfileBangers } from '@/lib/metaTwitter/bangers'
import {
  getCachedProfileHeader,
  resolveAccountId,
} from '@/lib/metaTwitter/data'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

export interface ResolvedProfile {
  accountId: string
  profile: ProfileHeaderData
}

export interface ProfilePreviewStats {
  archivedQuotes: number
  bangers: number
  yearsArchived: number
}

/**
 * Resolves either a stable account ID or a username to the shared profile
 * payload used by the page, its metadata, and its social preview image.
 */
export const resolveProfile = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const archiveAccountId = await resolveAccountId(param)
    if (archiveAccountId) {
      const profile = await getCachedProfileHeader(archiveAccountId)
      if (profile) return { accountId: archiveAccountId, profile }
    }

    const clickHouseProfile = await getClickHouseUserProfile(param)
    const accountId = clickHouseProfile?.user.account_id
    if (!clickHouseProfile || !accountId) return null
    const user = clickHouseProfile.user
    return {
      accountId,
      profile: {
        account_id: accountId,
        username: user.username,
        account_display_name: user.account_display_name,
        created_at: user.created_at,
        num_tweets: user.num_tweets,
        num_followers: user.num_followers,
        num_following: user.num_following,
        num_likes: user.num_likes,
        has_archive: user.has_archive,
        is_opted_in: user.is_opted_in,
        bio: user.bio,
        website: user.website,
        location: user.location,
        avatar_media_url: user.avatar_media_url,
        header_media_url: user.header_media_url ?? null,
      },
    }
  },
)

export const getProfilePreviewStats = cache(
  async (accountId: string): Promise<ProfilePreviewStats | null> => {
    const collection = await getProfileBangers(accountId)
    if (!collection.available) return null

    return {
      archivedQuotes: collection.tweets.reduce(
        (total, tweet) => total + tweet.quote_count,
        0,
      ),
      bangers: collection.total,
      yearsArchived: collection.yearCounts.length,
    }
  },
)
