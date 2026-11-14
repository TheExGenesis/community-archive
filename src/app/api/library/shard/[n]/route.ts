import { NextRequest, NextResponse } from 'next/server'
import {
  AnalyticsGatewayError,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import { reportApiError } from '@/lib/observability/apiError'
import { LIBRARY_CACHE_CONTROL } from '../../cache'

export const dynamic = 'force-dynamic'

const notFound = () =>
  NextResponse.json(
    { error: 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
  )

/** Who tweeted each work in one shard of the catalogue, and their tweets. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ n: string }> },
) {
  const { n } = await params
  if (!/^\d{1,4}$/.test(n)) return notFound()
  try {
    return NextResponse.json(
      await fetchAnalyticsGatewayJson(['library', 'shard', n]),
      { headers: { 'Cache-Control': LIBRARY_CACHE_CONTROL } },
    )
  } catch (error) {
    if (error instanceof AnalyticsGatewayError && error.status === 404) {
      return notFound()
    }
    return reportApiError({
      request,
      route: '/api/library/shard/[n]',
      status: 502,
      message: 'The library is temporarily unavailable. Please retry.',
      upstream: 'gateway',
      error,
    })
  }
}
