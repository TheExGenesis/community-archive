import { NextResponse } from 'next/server'
import { requireBulletinAdmin } from '@/lib/bulletin/data'
import { loadDecisionTweet } from '@/lib/bulletin/decisions'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  await requireBulletinAdmin()
  const headers = { 'Cache-Control': 'private, no-store' }
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!/^\d{1,20}$/.test(id))
    return NextResponse.json(
      { error: 'Invalid tweet ID' },
      { status: 400, headers },
    )
  try {
    const tweet = await loadDecisionTweet(id)
    return NextResponse.json({ tweet }, { status: tweet ? 200 : 404, headers })
  } catch {
    return NextResponse.json(
      { error: 'Post unavailable. Try again.' },
      { status: 503, headers },
    )
  }
}
