import { NextResponse } from 'next/server'
import { getTweetLinkPreviews } from '@/lib/linkPreviews'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export async function GET(
  _request: Request,
  { params }: { params: { tweet_id: string } },
) {
  if (!/^\d{1,20}$/.test(params.tweet_id)) {
    return NextResponse.json(
      { error: 'Invalid tweet ID' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  try {
    const previews = await getTweetLinkPreviews([params.tweet_id])
    return NextResponse.json(
      { previews: previews.get(params.tweet_id) ?? [] },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (error) {
    console.error('Tweet link preview request failed:', error)
    return NextResponse.json(
      { previews: [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
