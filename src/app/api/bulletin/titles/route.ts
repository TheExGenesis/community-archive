import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { visibleStatus } from '@/lib/bulletin/board'
import { matchesJevFilters } from '@/lib/bulletin/curation'
import { loadBulletinBoardSnapshot } from '@/lib/bulletin/data'
import {
  generateBulletinTitles,
  TITLES_PER_REQUEST_MAX,
} from '@/lib/bulletin/titles'
import { DEFAULT_BULLETIN_FILTERS } from '@/lib/bulletin/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const headers = { 'Cache-Control': 'private, no-store' }

function authorized(request: Request) {
  const secret = process.env.BULLETIN_TITLES_SECRET
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  return Boolean(
    process.env.VERCEL_ENV === 'production' &&
      secret &&
      secret.length >= 32 &&
      token &&
      Buffer.byteLength(token) === Buffer.byteLength(secret) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(secret)),
  )
}

/**
 * Called by the Bulletin worker after each run: gives live notices the AI
 * title their archive page would show, newest first, at most `limit` per
 * request. It reads the stored board directly, so notices the run just
 * published are included; the board picks titles up on its next build.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 404, headers })
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown }
  const limit = Math.max(
    1,
    Math.min(TITLES_PER_REQUEST_MAX, Number(body.limit) || 20),
  )
  const startedAt = Date.now()
  try {
    const now = Date.now()
    const live = (await loadBulletinBoardSnapshot()).filter(
      (o) =>
        visibleStatus(o, now, false, false) &&
        matchesJevFilters(o, DEFAULT_BULLETIN_FILTERS),
    )
    const result = await generateBulletinTitles(live, { limit })
    const summary = {
      message: 'Bulletin titles generated',
      live: live.length,
      ...result,
      durationMs: Date.now() - startedAt,
    }
    console.info(JSON.stringify(summary))
    return NextResponse.json(summary, { headers })
  } catch (error) {
    console.warn(
      'Bulletin titles failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json(
      { error: 'Bulletin titles unavailable' },
      { status: 503, headers },
    )
  }
}
