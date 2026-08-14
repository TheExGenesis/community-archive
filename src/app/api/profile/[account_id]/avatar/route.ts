import { NextResponse } from 'next/server'
import {
  getProfileBangersPage,
  PROFILE_BANGERS_INITIAL_LIMIT,
} from '@/lib/metaTwitter/bangers'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'
import { fetchSyndicatedTweets } from '@/lib/twitterSyndication'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

const avatarResponse = (
  avatarMediaUrl: string | null,
  status: 200 | 404 | 502,
) =>
  NextResponse.json(
    { avatar_media_url: avatarMediaUrl },
    {
      status,
      headers: {
        'Cache-Control':
          status === 200
            ? 'public, s-maxage=3600, stale-while-revalidate=86400'
            : status === 404
              ? 'public, s-maxage=300'
              : 'private, no-store',
      },
    },
  )

export async function GET(
  _request: Request,
  { params }: { params: { account_id: string } },
) {
  if (!ACCOUNT_ID_PATTERN.test(params.account_id)) {
    return NextResponse.json(
      { error: 'Invalid profile account' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const page = await getProfileBangersPage(params.account_id, {
    limit: PROFILE_BANGERS_INITIAL_LIMIT,
  })
  if (!page.available) return avatarResponse(null, 502)

  const storedAvatarUrl = page.tweets
    .map((tweet) => getHighResolutionAvatarUrl(tweet.avatar_media_url))
    .find(Boolean)
  if (storedAvatarUrl) return avatarResponse(storedAvatarUrl, 200)

  const tweets = await fetchSyndicatedTweets(
    page.tweets.map((tweet) => tweet.tweet_id),
    { limit: PROFILE_BANGERS_INITIAL_LIMIT },
  )
  const syndicatedAvatarUrl = page.tweets
    .map((tweet) => tweets.get(tweet.tweet_id))
    .find(
      (tweet) =>
        tweet?.account_id === params.account_id && tweet.avatar_media_url,
    )?.avatar_media_url
  const avatarMediaUrl = getHighResolutionAvatarUrl(syndicatedAvatarUrl) ?? null

  return avatarResponse(avatarMediaUrl, avatarMediaUrl ? 200 : 404)
}
