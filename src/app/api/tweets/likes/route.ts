import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  loadTweetLikeSummaries,
  MAX_SUMMARY_TWEET_IDS,
  resolveLiker,
  TWEET_ID_PATTERN,
} from '@/lib/tweetLikes/server'
import type { TweetLikeSummaryResponse } from '@/lib/tweetLikes/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Community Archive like counts and the viewer's own like state for a batch
 * of tweets. Tweet lists hydrate every visible like button from one call.
 */
export async function GET(request: Request) {
  const ids = Array.from(
    new Set(
      (new URL(request.url).searchParams.get('ids') ?? '')
        .split(',')
        .filter(Boolean),
    ),
  )
  if (
    ids.length === 0 ||
    ids.length > MAX_SUMMARY_TWEET_IDS ||
    !ids.every((id) => TWEET_ID_PATTERN.test(id))
  ) {
    return NextResponse.json(
      { error: `Pass 1-${MAX_SUMMARY_TWEET_IDS} numeric tweet ids.` },
      { status: 400 },
    )
  }

  const user = await getCurrentUser()
  try {
    const body: TweetLikeSummaryResponse = {
      signedIn: Boolean(user),
      likes: await loadTweetLikeSummaries(
        ids,
        (user && resolveLiker(user)?.accountId) ?? null,
      ),
    }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
