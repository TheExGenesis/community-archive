import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { getStreamedTweetCountByDate } from '@/lib/queries/getTweetCountByDate'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const granularity = searchParams.get('granularity')
    const timeOffset = parseInt(searchParams.get('timeOffset') || '0')

    if (!startDate || !endDate || !granularity) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate, granularity' },
        { status: 400 }
      )
    }

    const supabase = createServerClient(cookies())
    const data = await getStreamedTweetCountByDate(
      supabase,
      startDate,
      endDate,
      granularity as any
    )

    // Set cache headers based on granularity and time offset
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Cache strategy:
    // - Real-time data (timeOffset=0): short cache (5 minutes)
    // - Historical data (timeOffset>0): longer cache based on granularity
    if (timeOffset === 0) {
      // Real-time data: cache for 5 minutes, stale-while-revalidate for 1 hour
      headers['Cache-Control'] = 's-maxage=300, stale-while-revalidate=3600'
    } else {
      // Historical data: cache longer based on granularity
      switch (granularity) {
        case 'minute':
        case 'hour':
          // Short-term historical: cache for 1 hour
          headers['Cache-Control'] = 's-maxage=3600, stale-while-revalidate=86400'
          break
        case 'day':
          // Week view: cache for 12 hours
          headers['Cache-Control'] = 's-maxage=43200, stale-while-revalidate=86400'
          break
        case 'week':
          // Year view: cache for 24 hours
          headers['Cache-Control'] = 's-maxage=86400, stale-while-revalidate=172800'
          break
        default:
          headers['Cache-Control'] = 's-maxage=3600, stale-while-revalidate=86400'
      }
    }

    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error('Error in tweet-counts API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tweet counts' },
      { status: 500 }
    )
  }
}