import 'server-only'

import { cache } from 'react'
import { getClickHouseUserProfile } from '@/lib/clickhouseUserProfile'
import {
  getCachedProfileHeader,
  resolvePublicProfileIdentity,
} from '@/lib/metaTwitter/data'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

export interface ResolvedProfile {
  accountId: string
  profile: ProfileHeaderData
}

/** Archive ingest stores absent media as an empty string as often as null. */
const normalizeMediaUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Archive uploads frequently omit profile media, so an account can resolve to a
 * complete-looking archived profile that still renders a placeholder avatar.
 * Backfill only the fields the archive is missing: where both sources hold a
 * value they agree, so preferring the analytical copy wholesale would spend a
 * gateway request per render for no observable gain.
 */
async function withBackfilledMedia(
  profile: ProfileHeaderData,
  accountId: string,
): Promise<ProfileHeaderData> {
  const avatar = normalizeMediaUrl(profile.avatar_media_url)
  const header = normalizeMediaUrl(profile.header_media_url)
  if (avatar && header) {
    return { ...profile, avatar_media_url: avatar, header_media_url: header }
  }

  const fallback = await getClickHouseUserProfile(accountId)
  return {
    ...profile,
    avatar_media_url:
      avatar ?? normalizeMediaUrl(fallback?.user.avatar_media_url),
    header_media_url:
      header ?? normalizeMediaUrl(fallback?.user.header_media_url),
  }
}

/**
 * Resolves either a stable account ID or a username to the shared profile
 * payload used by the page, its metadata, and its social preview image.
 */
export const resolveProfile = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const publicIdentity = await resolvePublicProfileIdentity(param)
    if (!publicIdentity) return null

    if (publicIdentity.accountId) {
      const profile = await getCachedProfileHeader(publicIdentity.accountId)
      if (profile) {
        return {
          accountId: publicIdentity.accountId,
          profile: await withBackfilledMedia(profile, publicIdentity.accountId),
        }
      }
    }

    const clickHouseProfile = await getClickHouseUserProfile(
      publicIdentity.accountId ?? publicIdentity.username,
    )
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
        avatar_media_url: normalizeMediaUrl(user.avatar_media_url),
        header_media_url: normalizeMediaUrl(user.header_media_url),
      },
    }
  },
)
