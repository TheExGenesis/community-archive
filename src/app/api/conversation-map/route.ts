import { NextRequest, NextResponse } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'
import { loadConversationMap } from '@/lib/conversation-map/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const input =
    request.nextUrl.searchParams.get('year') ??
    String(new Date().getUTCFullYear())
  const year = Number(input)
  if (
    !/^\d{4}$/.test(input) ||
    year < 2006 ||
    year > new Date().getUTCFullYear()
  ) {
    return NextResponse.json(
      { error: 'Invalid year' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  try {
    return NextResponse.json(await loadConversationMap(year), {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return reportApiError({
      request,
      route: '/api/conversation-map',
      status: 502,
      message: 'The conversation map is temporarily unavailable. Please retry.',
      upstream: 'unknown',
      error,
    })
  }
}
