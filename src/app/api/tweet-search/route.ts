import { browsingAuthError } from '@/lib/browsingAuth'
import { NextRequest, NextResponse } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'
import {
  analyticsGatewayRequestUrl,
  clickHouseSearchGatewayBaseUrl,
  isClickHouseReadsEnabled,
} from '@/lib/clickhouseGateway'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const authError = await browsingAuthError()
  if (authError) return authError

  if (!isClickHouseReadsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const token = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!token) {
    return reportApiError({
      request,
      route: '/api/tweet-search',
      status: 503,
      message: 'Tweet search is not configured',
      upstream: 'none',
      error: new Error('CLICKHOUSE_ANALYTICS_API_TOKEN is not configured'),
    })
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

  const controller = new AbortController()
  const cancel = () => controller.abort(request.signal.reason)
  const timeout = setTimeout(() => controller.abort(), 25_000)
  if (request.signal.aborted) cancel()
  request.signal.addEventListener('abort', cancel, { once: true })
  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
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
    if (request.signal.aborted) return new NextResponse(null, { status: 499 })
    return reportApiError({
      request,
      route: '/api/tweet-search',
      status: 502,
      message: 'Tweet search is temporarily unavailable',
      upstream: 'gateway',
      error,
    })
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', cancel)
  }
}
