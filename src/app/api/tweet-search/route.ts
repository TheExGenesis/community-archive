import { NextRequest, NextResponse } from 'next/server'
import {
  analyticsGatewayRequestUrl,
  clickHouseSearchGatewayBaseUrl,
  isClickHouseReadsEnabled,
} from '@/lib/clickhouseGateway'
import { enforceBotId } from '@/lib/botIdServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const botResponse = await enforceBotId()
  if (botResponse) return botResponse

  if (!isClickHouseReadsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const token = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!token) {
    console.error('CLICKHOUSE_ANALYTICS_API_TOKEN is not configured')
    return NextResponse.json(
      { error: 'Tweet search is not configured' },
      { status: 503 },
    )
  }

  let target: URL
  try {
    target = analyticsGatewayRequestUrl(
      ['search'],
      new URL(request.url).searchParams,
      clickHouseSearchGatewayBaseUrl(),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
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
    console.error('ClickHouse tweet search request failed:', error)
    return NextResponse.json(
      { error: 'Tweet search is temporarily unavailable' },
      { status: 502 },
    )
  }
}
