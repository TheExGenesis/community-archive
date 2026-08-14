import { NextRequest, NextResponse } from 'next/server'
import { getClickHouseProfileInteractionsOrThrow } from '@/lib/metaTwitter/clickhouseSidebar'
import { applyPeopleCuration } from '@/lib/profileCuration'

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
    const generated = await getClickHouseProfileInteractionsOrThrow(
      params.account_id,
      year,
    )
    return NextResponse.json(
      {
        people: await applyPeopleCuration(
          params.account_id,
          year,
          generated.people,
        ),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (error) {
    console.error('Profile interactions request failed:', error)
    return NextResponse.json(
      { error: 'Profile interactions are temporarily unavailable' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
