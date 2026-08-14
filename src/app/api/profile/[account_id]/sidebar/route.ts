import { NextRequest, NextResponse } from 'next/server'
import { getClickHouseProfileSidebarOrThrow } from '@/lib/metaTwitter/clickhouseSidebar'

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

  try {
    return NextResponse.json(
      await getClickHouseProfileSidebarOrThrow(params.account_id, year),
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    )
  } catch (error) {
    console.error('Profile sidebar request failed:', error)
    return NextResponse.json(
      { error: 'Profile sidebar is temporarily unavailable' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
