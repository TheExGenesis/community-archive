import { NextRequest, NextResponse } from 'next/server'
import { getStrandPage } from '@/lib/community-apps/strand-list'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? ''
  const rawOffset = request.nextUrl.searchParams.get('offset') ?? '0'
  if (query.length > 120 || !/^\d{1,6}$/.test(rawOffset))
    return NextResponse.json(
      { error: 'Invalid search or offset' },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(await getStrandPage(query, Number(rawOffset)), {
      headers,
    })
  } catch {
    return NextResponse.json(
      { error: 'Strands could not load. Please try again.' },
      { status: 503, headers },
    )
  }
}
