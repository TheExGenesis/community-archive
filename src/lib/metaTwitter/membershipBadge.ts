/**
 * Membership badge shown next to a display name. Mirrors MembershipStatusIcon:
 * an uploaded archive outranks a plain opt-in, and a profile with neither gets
 * no badge at all.
 */
export type MembershipBadge = 'archive' | 'opted-in' | null

export function membershipBadge(profile: {
  has_archive: boolean
  is_opted_in: boolean
}): MembershipBadge {
  if (profile.has_archive) return 'archive'
  if (profile.is_opted_in) return 'opted-in'
  return null
}

export const MEMBERSHIP_BADGE_LABELS: Record<
  Exclude<MembershipBadge, null>,
  string
> = {
  archive: 'Archive uploaded',
  'opted-in': 'Opted in',
}
