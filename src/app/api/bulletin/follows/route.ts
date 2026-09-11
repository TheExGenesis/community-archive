import { NextResponse } from 'next/server'
import { loadBulletinFollowLists } from '@/lib/bulletin/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  // The loader authenticates and derives the viewer from trusted session data.
  return NextResponse.json(await loadBulletinFollowLists(), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
