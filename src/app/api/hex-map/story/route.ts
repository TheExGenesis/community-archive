import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { locatedDetail } from '@/lib/hexMap/data'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  const kind = request.nextUrl.searchParams.get('kind')
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (
    !(kind === 'strand' && /^\d{1,20}$/.test(id)) &&
    !(kind === 'digest' && /^\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9_-]{1,160}$/.test(id))
  )
    return NextResponse.json(
      { error: 'Invalid story' },
      { status: 400, headers },
    )
  try {
    const result = await locatedDetail(kind as 'digest' | 'strand', id)
    return NextResponse.json(result ?? { error: 'Story unavailable' }, {
      status: result ? 200 : 404,
      headers,
    })
  } catch {
    return NextResponse.json(
      { error: 'Story could not load. Please try again.' },
      { status: 503, headers },
    )
  }
}
