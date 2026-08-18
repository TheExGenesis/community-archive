import { isProjectContributor } from '@/lib/projectContributors'

/**
 * The single badge shown beside a display name on the social card, mirroring
 * what the profile header renders: ProjectContributorBadge credits the handful
 * of people who built the project, and MembershipStatusIcon reports whether an
 * archive was uploaded or the account merely opted in. Contributor wins because
 * it is the rarer and more specific claim.
 */
export type ProfileBadge = 'contributor' | 'archive' | 'opted-in' | null

export function profileBadge(profile: {
  username: string
  has_archive: boolean
  is_opted_in: boolean
}): ProfileBadge {
  if (isProjectContributor(profile.username)) return 'contributor'
  if (profile.has_archive) return 'archive'
  if (profile.is_opted_in) return 'opted-in'
  return null
}

export const PROFILE_BADGE_LABELS: Record<
  Exclude<ProfileBadge, null>,
  string
> = {
  contributor: 'Archive contributor',
  archive: 'Archive uploaded',
  'opted-in': 'Opted in',
}
