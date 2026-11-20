import { NextResponse } from 'next/server'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import { visibleStatus } from '@/lib/bulletin/board'
import { matchesJevFilters } from '@/lib/bulletin/curation'
import { loadPublicBulletinBoard } from '@/lib/bulletin/data'
import { generateBulletinTitles } from '@/lib/bulletin/titles'
import { DEFAULT_BULLETIN_FILTERS } from '@/lib/bulletin/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Hourly: give live Bulletin notices the AI title their archive page would
 * show, so cards can lead with it. Each run handles the newest untitled
 * notices up to a fixed count; the board picks titles up on its next build.
 */
export async function GET(request: Request) {
  if (!isAuthorizedDigestCronRequest(request))
    return new NextResponse('Unauthorized', { status: 401 })
  const startedAt = Date.now()
  const board = await loadPublicBulletinBoard()
  const now = Date.now()
  const live = Array.from(board.sources.values()).filter(
    (o) =>
      visibleStatus(o, now, false, false) &&
      matchesJevFilters(o, DEFAULT_BULLETIN_FILTERS),
  )
  const result = await generateBulletinTitles(live)
  const summary = {
    message: 'Bulletin titles generated',
    live: live.length,
    ...result,
    durationMs: Date.now() - startedAt,
  }
  console.info(JSON.stringify(summary))
  return NextResponse.json(summary)
}
