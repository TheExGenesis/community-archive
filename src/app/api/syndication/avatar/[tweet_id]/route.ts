import { NextResponse } from 'next/server'
import { fetchSyndicatedTweet } from '@/lib/twitterSyndication'

export async function GET(
  _request: Request,
  { params }: { params: { tweet_id: string } },
) {
  const tweet = await fetchSyndicatedTweet(params.tweet_id)
  const avatarMediaUrl = tweet?.avatar_media_url

  if (!avatarMediaUrl) {
    return NextResponse.json(
      { avatar_media_url: null },
      {
        status: 404,
        headers: { 'Cache-Control': 'public, s-maxage=300' },
      },
    )
  }

  return NextResponse.json(
    { avatar_media_url: avatarMediaUrl },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
