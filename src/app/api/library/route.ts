import { NextRequest, NextResponse } from 'next/server'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { reportApiError } from '@/lib/observability/apiError'
import { LIBRARY_CACHE_CONTROL } from './cache'

export const dynamic = 'force-dynamic'

/** The CA Library catalogue: a weekly file snapshot served by the gateway. */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await fetchAnalyticsGatewayJson(['library']), {
      headers: { 'Cache-Control': LIBRARY_CACHE_CONTROL },
    })
  } catch (error) {
    return reportApiError({
      request,
      route: '/api/library',
      status: 502,
      message: 'The library is temporarily unavailable. Please retry.',
      upstream: 'gateway',
      error,
    })
  }
}
