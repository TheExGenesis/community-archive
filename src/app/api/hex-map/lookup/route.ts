import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { readMapLookup } from '@/lib/hexMap/lookup'
import { parseMapUsernames } from '@/lib/hexMap/usernames'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers },
    )
  const anchor = request.nextUrl.searchParams.get('name') || '',
    cells = request.nextUrl.searchParams.get('cells') || ''
  const requestedNames = anchor ? parseMapUsernames(anchor) : []
  if (!requestedNames || cells.length > 8000 || !/^\d*(,\d+)*$/.test(cells))
    return NextResponse.json(
      { error: 'Invalid map lookup' },
      { status: 400, headers },
    )
  try {
    const names = anchor
      ? requestedNames
      : cells
        ? []
        : sampleFeaturedArchives()
            .slice(0, 3)
            .map((p) => p.username)
    const result = await readMapLookup({ names: names.join(','), cells })
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Map locations are temporarily unavailable' },
      { status: 503, headers },
    )
  }
}
