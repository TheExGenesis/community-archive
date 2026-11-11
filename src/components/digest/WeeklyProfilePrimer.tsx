'use client'

import type { ProfilePreview } from '@/app/api/profile/[account_id]/preview/route'
import { primeProfilePreviews } from '@/components/agentSearch/ProfilePreview'

/**
 * Hands profiles that streamed in after the page to the hover cards. Renders
 * nothing; a card opened before this arrives falls back to its own lookup.
 */
export function WeeklyProfilePrimer({
  profiles,
}: {
  profiles: ProfilePreview[]
}) {
  if (typeof window !== 'undefined') primeProfilePreviews(profiles)
  return null
}
