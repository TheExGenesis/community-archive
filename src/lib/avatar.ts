export type AvatarProfile = {
  avatar_media_url?: string | null
  archive_upload_id?: number | null
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
