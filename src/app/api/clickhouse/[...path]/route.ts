import { NextRequest, NextResponse } from 'next/server'
import {
  analyticsGatewayRequestUrl,
  canAccessClickHouseLab,
} from '@/lib/clickhouseLab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  if (!(await canAccessClickHouseLab())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const token = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!token) {
    console.error('CLICKHOUSE_ANALYTICS_API_TOKEN is not configured')
    return NextResponse.json(
      { error: 'ClickHouse analytics is not configured' },
      { status: 503 },
    )
  }

  let target: URL
  try {
    target = analyticsGatewayRequestUrl(
      params.path,
      new URL(request.url).searchParams,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('ClickHouse analytics gateway request failed:', error)
    return NextResponse.json(
      { error: 'ClickHouse analytics gateway is unavailable' },
      { status: 502 },
    )
  }
}
