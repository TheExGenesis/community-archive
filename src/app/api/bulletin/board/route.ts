import { NextResponse } from 'next/server'
import { requireOpportunityUser } from '@/lib/bulletin/data'
import { BulletinCursorExpired, loadBulletinPage } from '@/lib/bulletin/page'
import { KIND_LABELS } from '@/lib/bulletin/types'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: Request) {
  await requireOpportunityUser()
  const p = new URL(request.url).searchParams
  const kind = p.get('kind') || 'all'
  const side = p.get('side') || 'all'
  const search = (p.get('q') || '').trim()
  const after = p.get('after') || undefined
  if (
    (kind !== 'all' &&
      !Object.prototype.hasOwnProperty.call(KIND_LABELS, kind)) ||
    !['all', 'ask', 'offer'].includes(side) ||
    search.length > 300 ||
    (after && (!/^\d{1,20}$/.test(after) || kind === 'all'))
  )
    return NextResponse.json(
      { error: 'Invalid board filters' },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(
      await loadBulletinPage(
        {
          kind,
          side,
          search,
          past: p.get('past') === '1',
          recommended: p.get('sort') !== 'newest',
        },
        after,
      ),
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BulletinCursorExpired
            ? error.message
            : 'Notices could not be loaded. Try again.',
      },
      { status: error instanceof BulletinCursorExpired ? 409 : 503, headers },
    )
  }
}
