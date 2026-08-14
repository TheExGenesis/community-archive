export type AvatarProfile = {
  avatar_media_url?: string | null
  archive_upload_id?: number | null
}

export type AvatarSize = 'small' | 'high'

const TWITTER_AVATAR_SIZE_SUFFIX =
  /_(?:normal|bigger|mini|200x200|400x400)(?=\.[a-z0-9]+(?:[?#]|$))/i
const TWITTER_AVATAR_QUERY_SIZES = new Set([
  'mini',
  'normal',
  'bigger',
  'small',
  'medium',
  'large',
  '200x200',
  '400x400',
])

/**
 * Selects a Twitter/X avatar variant for the display context. Unknown and
 * non-Twitter URLs are left intact so stored relative or proxied URLs keep
 * working.
 */
export function getAvatarUrl(
  avatarMediaUrl: string | null | undefined,
  size: AvatarSize,
): string | undefined {
  if (!avatarMediaUrl) return undefined

  const sizeName = size === 'high' ? '400x400' : 'normal'
  const resizedSuffix = avatarMediaUrl.replace(
    TWITTER_AVATAR_SIZE_SUFFIX,
    `_${sizeName}`,
  )
  if (resizedSuffix !== avatarMediaUrl) return resizedSuffix

  try {
    const url = new URL(avatarMediaUrl)
    const requestedSize = url.searchParams.get('name')
    if (
      url.hostname === 'pbs.twimg.com' &&
      requestedSize &&
      TWITTER_AVATAR_QUERY_SIZES.has(requestedSize.toLowerCase())
    ) {
      url.searchParams.set('name', sizeName)
      return url.toString()
    }
  } catch {
    // Stored avatar values can be relative URLs. Leave unknown forms intact.
  }

  return avatarMediaUrl
}

/**
 * Requests Twitter's larger profile image variant when the stored URL points
 * at one of its thumbnail variants. URLs without a known size marker are
 * already the best available source and are returned unchanged.
 */
export function getHighResolutionAvatarUrl(
  avatarMediaUrl: string | null | undefined,
): string | undefined {
  return getAvatarUrl(avatarMediaUrl, 'high')
}

export function getSmallAvatarUrl(
  avatarMediaUrl: string | null | undefined,
): string | undefined {
  return getAvatarUrl(avatarMediaUrl, 'small')
}

export function getLatestAvatarMediaUrl(
  profile: AvatarProfile | AvatarProfile[] | null | undefined,
): string | undefined {
  if (!profile) return undefined

  if (!Array.isArray(profile)) {
    return profile.avatar_media_url || undefined
  }

  const latestProfileWithAvatar = profile
    .filter((candidate) => candidate.avatar_media_url)
    .reduce<AvatarProfile | undefined>((latest, candidate) => {
      if (!latest) return candidate

      const latestId = Number(latest.archive_upload_id ?? 0)
      const candidateId = Number(candidate.archive_upload_id ?? 0)
      return candidateId >= latestId ? candidate : latest
    }, undefined)

  return latestProfileWithAvatar?.avatar_media_url || undefined
}
