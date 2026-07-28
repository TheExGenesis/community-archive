import { NextRequest, NextResponse } from 'next/server'
import {
  DateRangeValidation,
  getStatsRangeLimitMs,
  validateDateRange,
} from '@/lib/apiInputValidation'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_HOURS_BACK = 720
const SUPPORTED_GRANULARITIES = new Set(['hour', 'day', 'week'])

type StreamStatsResponse = {
  data: Array<{
    period_start: string
    period_end: string
    tweet_count: number
    source_messages: number
    source_count: number
    latest_observed_at: string | null
  }>
  summary: {
    totalTweets: number
    sourceMessages: number
    sourceCount: number
    avgTweetsPerPeriod: number
    periodsIncluded: number
    latestObservedAt: string | null
    scope: 'firehose' | 'all'
    countMode: 'unique_tweets_observed'
  }
  timing: {
    wallMs: number
    clickhouseMs: number
    rowsRead: number
    bytesRead: number
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hoursBack = Number(searchParams.get('hoursBack') || '24')
    const granularity = searchParams.get('granularity') || 'hour'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const streamedOnly = searchParams.get('streamedOnly') !== 'false'

    if (
      !Number.isInteger(hoursBack) ||
      hoursBack < 1 ||
      hoursBack > MAX_HOURS_BACK
    ) {
      return NextResponse.json(
        { error: 'Invalid hoursBack parameter. Must be between 1 and 720.' },
        { status: 400 },
      )
    }
    if (!SUPPORTED_GRANULARITIES.has(granularity)) {
      return NextResponse.json(
        { error: 'Invalid granularity. Must be one of: hour, day, week.' },
        { status: 400 },
      )
    }

    const maxRangeMs = getStatsRangeLimitMs(granularity)
    if (maxRangeMs === null) {
      return NextResponse.json(
        { error: 'Invalid granularity.' },
        { status: 400 },
      )
    }

    let range: Extract<DateRangeValidation, { ok: true }>
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: 'Both startDate and endDate are required for custom range.' },
          { status: 400 },
        )
      }
      const customRange = validateDateRange(startDate, endDate, maxRangeMs)
      if (!customRange.ok && customRange.error === 'invalid') {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO 8601 timestamps.' },
          { status: 400 },
        )
      }
      if (!customRange.ok && customRange.error === 'order') {
        return NextResponse.json(
          { error: 'startDate must be before endDate' },
          { status: 400 },
        )
      }
      if (!customRange.ok) {
        return NextResponse.json(
          { error: `Date range too large for ${granularity} granularity.` },
          { status: 400 },
        )
      }
      range = customRange
    } else {
      const end = new Date()
      const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000)
      range = { ok: true, start, end }
    }

    const upstreamParams = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      granularity,
      scope: streamedOnly ? 'firehose' : 'all',
    })
    const response = await fetchAnalyticsGatewayJson<StreamStatsResponse>(
      ['stream-stats'],
      upstreamParams,
      { timeoutMs: 25_000 },
    )

    const currentPeriod =
      range.end > new Date(Date.now() - 60 * 60 * 1000)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': currentPeriod
          ? 's-maxage=300, stale-while-revalidate=600'
          : 's-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('ClickHouse stream-stats request failed:', error)
    return NextResponse.json(
      { error: 'Streaming statistics are temporarily unavailable' },
      { status: 502 },
    )
  }
}
