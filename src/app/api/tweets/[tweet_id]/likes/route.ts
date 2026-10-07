import { NextResponse } from 'next/server'
import {
  loadTweetLikeCount,
  MAX_LIKERS,
  TWEET_ID_PATTERN,
} from '@/lib/tweetLikes/server'
import type { TweetLikersResponse } from '@/lib/tweetLikes/types'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The most recent accounts that liked a tweet on Community Archive. */
export async function GET(
  _request: Request,
  { params }: { params: { tweet_id: string } },
) {
  if (!TWEET_ID_PATTERN.test(params.tweet_id)) {
    return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
  }

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('ca_tweet_likes')
    .select('account_id, username, display_name, created_at')
    .eq('tweet_id', params.tweet_id)
    .order('created_at', { ascending: false })
    .limit(MAX_LIKERS)

  try {
    if (error) throw new Error(`Tweet likers lookup failed: ${error.message}`)
    const body: TweetLikersResponse = {
      count: await loadTweetLikeCount(params.tweet_id),
      likers: (data ?? []).map((row) => ({
        accountId: row.account_id,
        username: row.username,
        displayName: row.display_name,
        likedAt: row.created_at,
      })),
    }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (lookupError) {
    console.error(lookupError)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
