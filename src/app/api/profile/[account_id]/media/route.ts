import { NextRequest, NextResponse } from 'next/server'
import { getClickHouseProfileMediaOrThrow } from '@/lib/metaTwitter/clickhouseSidebar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

export async function GET(
  request: NextRequest,
  { params }: { params: { account_id: string } },
) {
  if (!ACCOUNT_ID_PATTERN.test(params.account_id)) {
    return NextResponse.json(
      { error: 'Invalid profile account' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const yearValue = request.nextUrl.searchParams.get('year')
  let year: number | undefined
  if (yearValue !== null) {
    year = Number(yearValue)
    if (
      !Number.isInteger(year) ||
      year < 2006 ||
      year > new Date().getUTCFullYear() + 1
    ) {
      return NextResponse.json(
        { error: 'Invalid profile year' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
  }
  const limitValue = request.nextUrl.searchParams.get('limit')
  const offsetValue = request.nextUrl.searchParams.get('offset')
  const limit = limitValue === null ? 6 : Number(limitValue)
  const offset = offsetValue === null ? 0 : Number(offsetValue)
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 5_000
  ) {
    return NextResponse.json(
      { error: 'Invalid profile media pagination' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    return NextResponse.json(
      await getClickHouseProfileMediaOrThrow(params.account_id, year, {
        limit,
        offset,
      }),
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    )
  } catch (error) {
    console.error('Profile media request failed:', error)
    return NextResponse.json(
      { error: 'Profile media is temporarily unavailable' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
