import 'server-only'

import type { User } from '@supabase/supabase-js'
import { resolveCommenterIdentity } from '@/lib/digest/comments'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { TweetLikeSummary } from './types'

export const TWEET_ID_PATTERN = /^\d{1,20}$/
export const MAX_SUMMARY_TWEET_IDS = 100
export const MAX_LIKERS = 50

/**
 * The X account behind a session. Likes are public records attributed to an
 * X account, so sessions without one (e.g. dev logins) cannot like.
 */
export function resolveLiker(user: User) {
  const accountId = user.app_metadata?.provider_id
  if (typeof accountId !== 'string' || !TWEET_ID_PATTERN.test(accountId)) {
    return null
  }
  return { accountId, ...resolveCommenterIdentity(user) }
}

/** Tweets nobody has liked are absent from the result. */
export async function loadTweetLikeSummaries(
  tweetIds: string[],
  viewerId: string | null,
): Promise<Record<string, TweetLikeSummary>> {
  if (tweetIds.length === 0) return {}

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin.rpc('ca_tweet_like_summary', {
    p_tweet_ids: tweetIds,
    p_viewer_id: viewerId,
  })
  if (error) throw new Error(`Tweet like summary failed: ${error.message}`)

  const summaries: Record<string, TweetLikeSummary> = {}
  for (const row of data ?? []) {
    summaries[row.tweet_id] = {
      count: Number(row.like_count),
      liked: row.viewer_liked,
    }
  }
  return summaries
}

export async function loadTweetLikeCount(tweetId: string) {
  const summaries = await loadTweetLikeSummaries([tweetId], null)
  return summaries[tweetId]?.count ?? 0
}
