import { NextResponse } from 'next/server'
import { requireBulletinUser } from '@/lib/bulletin/data'
import { loadBulletinTweets } from '@/lib/bulletin/tweets'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: Request) {
  await requireBulletinUser()
  const ids = Array.from(
    new Set((new URL(request.url).searchParams.get('ids') || '').split(',')),
  )
  if (ids.length > 8 || ids.some((id) => !/^\d{1,20}$/.test(id)))
    return NextResponse.json(
      { error: 'Provide 1–8 tweet IDs' },
      { status: 400, headers },
    )
  try {
    const result = await loadBulletinTweets(ids)
    return NextResponse.json({ tweets: result.tweets }, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Original posts could not be loaded. Try again.' },
      { status: 503, headers },
    )
  }
}
