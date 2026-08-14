import { NextRequest, NextResponse } from 'next/server'
import {
  getPortalStreamPage,
  getPortalStreamUpdates,
  type PortalStreamPageCursor,
  type PortalStreamUpdateCursor,
} from '@/lib/portal/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function parseUpdateCursor(
  searchParams: URLSearchParams,
): PortalStreamUpdateCursor | null {
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

function parsePageCursor(
  searchParams: URLSearchParams,
): PortalStreamPageCursor | null {
  const before = searchParams.get('before')
  const beforeId = searchParams.get('beforeId')
  if (!before && !beforeId) return null
  if (!before || !beforeId || !/^\d{1,32}$/.test(beforeId)) {
    throw new Error('Invalid stream cursor')
  }
  const createdAt = new Date(before)
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('Invalid stream cursor')
  }
  return { createdAt: createdAt.toISOString(), id: beforeId }
}

export async function GET(request: NextRequest) {
  let updateCursor: PortalStreamUpdateCursor | null
  let pageCursor: PortalStreamPageCursor | null
  try {
    const searchParams = new URL(request.url).searchParams
    updateCursor = parseUpdateCursor(searchParams)
    pageCursor = parsePageCursor(searchParams)
    if (updateCursor && pageCursor) throw new Error('Invalid stream cursor')
  } catch {
    return NextResponse.json(
      { error: 'Invalid stream cursor' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    if (updateCursor) {
      const tweets = await getPortalStreamUpdates(100, updateCursor)
      const edge = tweets[tweets.length - 1]
      return NextResponse.json(
        {
          tweets,
          backlogTruncated: tweets.length === 100,
          updateCursor: edge
            ? { observedAt: edge.observedAt, id: edge.id }
            : null,
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      )
    }

    const pageSize = 30
    const rows = await getPortalStreamPage(
      pageSize + 1,
      pageCursor ?? undefined,
    )
    const hasMore = rows.length > pageSize
    const tweets = rows.slice(0, pageSize)
    const edge = tweets[tweets.length - 1]
    return NextResponse.json(
      {
        tweets,
        nextCursor: edge ? { createdAt: edge.createdAt, id: edge.id } : null,
        hasMore,
      },
      {
        headers: {
          'Cache-Control': pageCursor
            ? 'public, s-maxage=15, stale-while-revalidate=30'
            : 'private, no-store',
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
