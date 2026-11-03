import { NextResponse } from 'next/server'
import { fetchSyndicatedTweet } from '@/lib/twitterSyndication'

/**
 * Render-time hydration of a single tweet that is not in the archive, used by
 * CA Tube for reply parents. Returns only what the comment renders and is
 * never persisted (see src/lib/twitterSyndication.ts).
 */
export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ tweet_id: string }> },
) {
  const { tweet_id } = await paramsPromise
  const tweet = /^\d{5,25}$/.test(tweet_id)
    ? await fetchSyndicatedTweet(tweet_id)
    : null

  if (!tweet) {
    return NextResponse.json(
      { tweet: null },
      { status: 404, headers: { 'Cache-Control': 'public, s-maxage=3600' } },
    )
  }

  return NextResponse.json(
    {
      tweet: {
        t: tweet.tweet_id,
        u: tweet.username,
        n: tweet.account_display_name,
        av: tweet.avatar_media_url ?? '',
        x: tweet.full_text,
        f: tweet.favorite_count,
        c: Math.floor(new Date(tweet.created_at).getTime() / 1000),
      },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
