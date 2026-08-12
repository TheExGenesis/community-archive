export type AvatarProfile = {
  avatar_media_url?: string | null
  archive_upload_id?: number | null
}

const TWITTER_AVATAR_SIZE_SUFFIX =
  /_(?:normal|bigger|mini|200x200)(?=\.[a-z0-9]+(?:[?#]|$))/i

/**
 * Requests Twitter's larger profile image variant when the stored URL points
 * at one of its thumbnail variants. URLs without a known size marker are
 * already the best available source and are returned unchanged.
 */
export function getHighResolutionAvatarUrl(
  avatarMediaUrl: string | null | undefined,
): string | undefined {
  if (!avatarMediaUrl) return undefined

  const upgradedSuffix = avatarMediaUrl.replace(
    TWITTER_AVATAR_SIZE_SUFFIX,
    '_400x400',
  )
  if (upgradedSuffix !== avatarMediaUrl) return upgradedSuffix

  try {
    const url = new URL(avatarMediaUrl)
    const requestedSize = url.searchParams.get('name')
    if (
      url.hostname === 'pbs.twimg.com' &&
      requestedSize &&
      ['normal', 'small', 'medium', '200x200'].includes(requestedSize)
    ) {
      url.searchParams.set('name', '400x400')
      return url.toString()
    }
  } catch {
    // Stored avatar values can be relative URLs. Leave unknown forms intact.
  }

  return avatarMediaUrl
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
