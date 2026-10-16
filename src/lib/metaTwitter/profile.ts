import 'server-only'

import { cache } from 'react'
import { measureServerRead } from '@/lib/performance/server'
import { getClickHouseUserProfile } from '@/lib/clickhouseUserProfile'
import { isTwitterUsername } from '@/lib/apiInputValidation'
import {
  getCachedProfileHeader,
  isPolicyBlockedAccount,
  resolvePublicProfileIdentity,
  type PublicProfileIdentity,
} from '@/lib/metaTwitter/data'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

export interface ResolvedProfile {
  accountId: string
  /** False for accounts served from the corpus without having joined. */
  isMember: boolean
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
export const withBackfilledMedia = cache(async function withBackfilledMedia(
  profile: ProfileHeaderData,
  accountId: string,
): Promise<ProfileHeaderData> {
  const avatar = normalizeMediaUrl(profile.avatar_media_url)
  const header = normalizeMediaUrl(profile.header_media_url)
  if (avatar && header) {
    return { ...profile, avatar_media_url: avatar, header_media_url: header }
  }

  const fallback = await measureServerRead('profile.optional-media', () =>
    getClickHouseUserProfile(accountId, { tweetLimit: 1 }),
  )
  return {
    ...profile,
    avatar_media_url:
      avatar ?? normalizeMediaUrl(fallback?.user.avatar_media_url),
    header_media_url:
      header ?? normalizeMediaUrl(fallback?.user.header_media_url),
  }
})

async function analyticalProfile(
  identifier: string,
  isMember: boolean,
): Promise<ResolvedProfile | null> {
  const clickHouseProfile = await getClickHouseUserProfile(identifier)
  const accountId = clickHouseProfile?.user.account_id
  if (!clickHouseProfile || !accountId) return null
  const user = clickHouseProfile.user
  return {
    accountId,
    isMember,
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
}

async function memberProfile(
  identity: PublicProfileIdentity,
): Promise<ResolvedProfile | null> {
  if (identity.accountId) {
    const profile = await measureServerRead('profile.header', () =>
      getCachedProfileHeader(identity.accountId!),
    )
    if (profile) {
      return {
        accountId: identity.accountId,
        isMember: true,
        profile: {
          ...profile,
          avatar_media_url: normalizeMediaUrl(profile.avatar_media_url),
          header_media_url: normalizeMediaUrl(profile.header_media_url),
        },
      }
    }
  }
  return analyticalProfile(identity.accountId ?? identity.username, true)
}

/**
 * Accounts outside the member directory are served from the analytical corpus
 * unless PostgreSQL policy withholds them. The directory hides opted-out
 * members too, so the policy check is what keeps them from reappearing here.
 */
async function resolveNonMemberProfile(
  param: string,
): Promise<ResolvedProfile | null> {
  let identifier: string
  try {
    identifier = decodeURIComponent(param)
  } catch {
    return null
  }
  const isAccountId = /^\d{1,20}$/.test(identifier)
  if (!isAccountId && !isTwitterUsername(identifier)) return null

  // Lowercase handles so every casing shares one cached gateway response.
  const resolved = await analyticalProfile(
    isAccountId ? identifier : identifier.toLowerCase(),
    false,
  )
  if (!resolved) return null

  // The directory can still hold a member under a handle they have since
  // changed; the stable ID finds them.
  if (!isAccountId) {
    const member = await measureServerRead('profile.eligibility', () =>
      resolvePublicProfileIdentity(resolved.accountId),
    )
    if (member) return memberProfile(member)
  }

  const blocked = await measureServerRead('profile.policy', () =>
    isPolicyBlockedAccount(resolved.accountId, resolved.profile.username),
  )
  return blocked ? null : resolved
}

/**
 * Resolves either a stable account ID or a username to the shared profile
 * payload used by the page, its metadata, and its social preview image.
 */
export const resolveProfileCore = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const publicIdentity = await measureServerRead('profile.eligibility', () =>
      resolvePublicProfileIdentity(param),
    )
    return publicIdentity
      ? memberProfile(publicIdentity)
      : resolveNonMemberProfile(param)
  },
)

/**
 * Member-only resolution for crawlers. Non-member pages are noindex, and each
 * one costs a gateway read plus a policy check, so crawlers get the same 404
 * they saw before those pages existed.
 */
export const resolveMemberProfileCore = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const publicIdentity = await measureServerRead('profile.eligibility', () =>
      resolvePublicProfileIdentity(param),
    )
    return publicIdentity ? memberProfile(publicIdentity) : null
  },
)

/** Full media remains available for social cards; navigation uses the core. */
export const resolveProfile = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const resolved = await resolveProfileCore(param)
    if (!resolved) return null
    return {
      ...resolved,
      profile: await withBackfilledMedia(resolved.profile, resolved.accountId),
    }
  },
)
