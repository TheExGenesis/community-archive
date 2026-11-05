import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { storyPage } from '@/lib/hexMap/data'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  const kind = request.nextUrl.searchParams.get('kind') ?? 'digest'
  const cells = (request.nextUrl.searchParams.get('cells') || '')
    .split(',')
    .filter(Boolean)
    .map(Number)
  if (
    cells.length > 1730 ||
    cells.some((c) => !Number.isInteger(c) || c < 0 || c >= 1730)
  )
    return NextResponse.json(
      { error: 'Invalid cells' },
      { status: 400, headers },
    )
  const offset = request.nextUrl.searchParams.get('offset') ?? '0'
  if (!['digest', 'strand'].includes(kind) || !/^\d{1,5}$/.test(offset))
    return NextResponse.json(
      { error: 'Invalid story page' },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(
      await storyPage(kind as 'digest' | 'strand', Number(offset), cells),
      { headers },
    )
  } catch {
    return NextResponse.json(
      { error: 'Stories are temporarily unavailable. Please try again.' },
      { status: 503, headers },
    )
  }
}
