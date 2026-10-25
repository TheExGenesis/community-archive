import { NextRequest, NextResponse } from 'next/server'
import { readMapLookup } from '@/lib/hexMap/lookup'
import type { MapPeoplePage } from '@/lib/hexMap/gateway'
import { MAP_VERSION } from '@/lib/hexMap/version'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if (params.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers },
    )
  const cells = params.get('cells') || ''
  const offset = params.get('offset') || '0'
  if (
    cells.length > 8000 ||
    !/^\d+(,\d+)*$/.test(cells) ||
    cells.split(',').some((id) => Number(id) >= 1730) ||
    !/^\d{1,5}$/.test(offset) ||
    Number(offset) > 10000
  )
    return NextResponse.json(
      { error: 'Invalid map people page' },
      { status: 400, headers },
    )
  try {
    const result = (await readMapLookup({
      cells,
      offset,
      peoplePage: '1',
    })) as MapPeoplePage
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json(
      { error: 'People are temporarily unavailable' },
      { status: 503, headers },
    )
  }
}
