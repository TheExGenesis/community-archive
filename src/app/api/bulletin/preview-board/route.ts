import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { loadBulletinBoardSnapshot } from '@/lib/bulletin/data'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const secret = process.env.BULLETIN_PREVIEW_READ_SECRET
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (
    process.env.VERCEL_ENV !== 'production' ||
    !secret ||
    secret.length < 32 ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return new Response(null, { status: 404, headers })

  try {
    return NextResponse.json(await loadBulletinBoardSnapshot(), { headers })
  } catch {
    return NextResponse.json(
      { error: 'Bulletin snapshot unavailable' },
      { status: 503, headers },
    )
  }
}
