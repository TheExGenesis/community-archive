import { NextResponse } from 'next/server'
import { requireBulletinUser } from '@/lib/bulletin/data'
import { BulletinCursorExpired, loadBulletinPage } from '@/lib/bulletin/page'
import { parseKinds } from '@/lib/bulletin/types'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: Request) {
  await requireBulletinUser()
  const p = new URL(request.url).searchParams
  const kind = p.get('kind') || 'all'
  const side = p.get('side') || 'all'
  const search = (p.get('q') || '').trim()
  const after = p.get('after') || undefined
  if (
    parseKinds(kind) === null ||
    !['all', 'ask', 'offer'].includes(side) ||
    search.length > 300 ||
    (after && !/^\d{1,20}$/.test(after))
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
          ascending: p.get('dir') === 'asc',
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
