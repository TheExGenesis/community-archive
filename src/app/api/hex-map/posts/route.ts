import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { mapGateway, portalPost, type MapPost } from '@/lib/hexMap/gateway'
import { memberTweets } from '@/lib/hexMap/data'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  const p = request.nextUrl.searchParams,
    cells = p.get('cells') || '',
    sort = p.get('sort') || 'likes',
    offset = p.get('offset') || '0'
  if (
    !/^\d+(,\d+)*$/.test(cells) ||
    cells.length > 8000 ||
    !['likes', 'time', 'quotes'].includes(sort) ||
    !/^\d{1,4}$/.test(offset) ||
    Number(offset) > 2000
  )
    return NextResponse.json(
      { error: 'Invalid map page' },
      { status: 400, headers },
    )
  try {
    const result = await mapGateway<{
      data: MapPost[]
      nextOffset: number | null
    }>('hex-posts', { cells, sort, offset })
    const allowed = await memberTweets(result.data.map(portalPost)),
      byId = new Map(result.data.map((t) => [t.tweetId, t]))
    return NextResponse.json(
      {
        tweets: allowed.map((tweet) => ({
          tweet,
          cell: byId.get(tweet.id)!.cell,
          memberQuotes: byId.get(tweet.id)!.memberQuotes,
        })),
        nextOffset: result.nextOffset,
      },
      { headers },
    )
  } catch {
    return NextResponse.json(
      { error: 'Map posts are temporarily unavailable' },
      { status: 503, headers },
    )
  }
}
