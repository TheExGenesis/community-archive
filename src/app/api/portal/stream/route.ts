import { NextRequest, NextResponse } from 'next/server'
import { getPortalStream, type PortalStreamCursor } from '@/lib/portal/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function parseCursor(searchParams: URLSearchParams): PortalStreamCursor | null {
  const after = searchParams.get('after')
  const afterId = searchParams.get('afterId')
  if (!after && !afterId) return null
  if (!after || !afterId || !/^\d{1,32}$/.test(afterId)) {
    throw new Error('Invalid stream cursor')
  }
  const observedAt = new Date(after)
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('Invalid stream cursor')
  }
  return { observedAt: observedAt.toISOString(), id: afterId }
}

export async function GET(request: NextRequest) {
  let cursor: PortalStreamCursor | null
  try {
    cursor = parseCursor(new URL(request.url).searchParams)
  } catch {
    return NextResponse.json(
      { error: 'Invalid stream cursor' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    const tweets = await getPortalStream(cursor ? 100 : 30, cursor ?? undefined)
    const edge = cursor ? tweets[tweets.length - 1] : tweets[0]
    const nextCursor = edge
      ? { observedAt: edge.observedAt, id: edge.id }
      : null
    return NextResponse.json(
      { tweets, nextCursor },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    console.error('Portal stream request failed:', error)
    return NextResponse.json(
      { error: 'The live stream is temporarily unavailable' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
