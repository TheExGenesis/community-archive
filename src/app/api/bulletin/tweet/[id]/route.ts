import { NextResponse } from 'next/server'
import { requireBulletinUser } from '@/lib/bulletin/data'
import { loadBulletinTweets } from '@/lib/bulletin/tweets'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await requireBulletinUser()
  if (!/^\d{1,20}$/.test(params.id))
    return NextResponse.json(
      { error: 'Invalid tweet' },
      { status: 400, headers },
    )
  try {
    const result = await loadBulletinTweets([params.id])
    if (!result.tweets.length)
      return NextResponse.json(
        { error: 'Original post unavailable' },
        { status: result.errors[params.id] || 503, headers },
      )
    return NextResponse.json(result.tweets[0], { headers })
  } catch {
    return NextResponse.json(
      { error: 'Original post could not be loaded. Try again.' },
      { status: 503, headers },
    )
  }
}
