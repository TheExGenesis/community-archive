import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'
import { mapGateway, type MapHeat } from '@/lib/hexMap/gateway'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  const q = (request.nextUrl.searchParams.get('q') || '').trim(),
    headers = { 'Cache-Control': 'private, no-store' }
  if (!q || q.length > 80)
    return NextResponse.json(
      { error: 'Invalid term' },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(
      await mapGateway<MapHeat>('hex-word-heat', { q }),
      { headers },
    )
  } catch (error) {
    return reportApiError({
      request,
      route: '/api/hex-map/heat',
      status: 503,
      message: 'Term heat map is temporarily unavailable',
      upstream: 'gateway',
      error,
      headers,
    })
  }
}
