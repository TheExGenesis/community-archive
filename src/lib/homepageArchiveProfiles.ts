import 'server-only'
import { cookies } from 'next/headers'
import type { AvatarType } from '@/lib/types'
import { createServerClient } from '@/utils/supabase'

const EXCLUDED_HOMEPAGE_ACCOUNT_IDS = new Set(['86927771'])

export async function loadHomepageArchiveProfiles(
  candidates: AvatarType[],
  supabase?: ReturnType<typeof createServerClient>,
): Promise<AvatarType[]> {
  const eligibleCandidates = candidates.filter(
    (candidate) => !EXCLUDED_HOMEPAGE_ACCOUNT_IDS.has(candidate.account_id),
  )
  const accountIds = Array.from(
    new Set(eligibleCandidates.map((candidate) => candidate.account_id)),
  )
  if (!accountIds.length) return []

  const client = supabase ?? createServerClient(cookies())
  const { data, error } = await client
    .schema('public')
    .from('user_directory')
    .select('account_id, username, avatar_media_url, num_tweets')
    .in('account_id', accountIds)

  if (error || !data) {
    console.error('Failed to load homepage archive profiles:', error)
    return []
  }

  const profileByAccountId = new Map(
    data.flatMap((profile) =>
      profile.account_id ? [[profile.account_id, profile] as const] : [],
    ),
  )

  return eligibleCandidates.flatMap((candidate) => {
    const profile = profileByAccountId.get(candidate.account_id)
    if (!profile) return []

    return [
      {
        ...candidate,
        username: profile.username || candidate.username,
        avatar_media_url:
          profile.avatar_media_url || candidate.avatar_media_url,
        ...(typeof profile.num_tweets === 'number' &&
        Number.isSafeInteger(profile.num_tweets) &&
        profile.num_tweets >= 0
          ? { num_tweets: profile.num_tweets }
          : {}),
      },
    ]
  })
}
