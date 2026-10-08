import { NextResponse } from 'next/server'
import { setBulletinDismissal } from '@/lib/bulletin/data'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

async function save(tweetId: string | null, dismissed: boolean) {
  if (tweetId !== null && !/^\d{1,20}$/.test(tweetId))
    return NextResponse.json(
      { error: 'Invalid notice' },
      { status: 400, headers },
    )
  try {
    // setBulletinDismissal re-checks the session and current consent.
    if (!(await setBulletinDismissal(tweetId, dismissed)))
      return NextResponse.json(
        { error: 'Local admin preview is read-only.' },
        { status: 403, headers },
      )
    return NextResponse.json({ ok: true }, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Could not save. Try again.' },
      { status: 503, headers },
    )
  }
}

/** Hide one notice as not relevant. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  return save(typeof body?.tweet_id === 'string' ? body.tweet_id : '', true)
}

/** Restore one notice, or every hidden notice when no id is given. */
export async function DELETE(request: Request) {
  return save(new URL(request.url).searchParams.get('tweet_id'), false)
}
