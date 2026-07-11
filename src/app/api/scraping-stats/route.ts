import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  DateRangeValidation,
  getStatsRangeLimitMs,
  validateDateRange,
} from '@/lib/apiInputValidation'

const MAX_HOURS_BACK = 720

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hoursBack = Number(searchParams.get('hoursBack') || '24')
    const granularity = searchParams.get('granularity') || 'hour'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const streamedOnly = searchParams.get('streamedOnly') !== 'false' // Default to true

    // Validate input
    if (!Number.isInteger(hoursBack) || hoursBack < 1 || hoursBack > MAX_HOURS_BACK) { // Max 30 days
      return NextResponse.json(
        { error: 'Invalid hoursBack parameter. Must be between 1 and 720.' },
        { status: 400 }
      )
    }

    const maxRangeMs = getStatsRangeLimitMs(granularity)
    if (maxRangeMs === null) {
      return NextResponse.json(
        { error: 'Invalid granularity. Must be one of: minute, hour, day, week, month.' },
        { status: 400 }
      )
    }

    if (hoursBack * 60 * 60 * 1000 > maxRangeMs) {
      return NextResponse.json(
        { error: `Date range too large for ${granularity} granularity.` },
        { status: 400 }
      )
    }

    // Validate custom date range up front so we can reject before we waste
    // a service-role RPC call. An attacker could otherwise request a 10-year
    // minute-granularity report and exhaust DB resources.
    let customRange: Extract<DateRangeValidation, { ok: true }> | null = null
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: 'Both startDate and endDate are required for custom range.' },
          { status: 400 }
        )
      }
      const range = validateDateRange(startDate, endDate, maxRangeMs)
      if (!range.ok && range.error === 'invalid') {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO 8601 timestamps.' },
          { status: 400 }
        )
      }
      if (!range.ok && range.error === 'order') {
        return NextResponse.json(
          { error: 'startDate must be before endDate' },
          { status: 400 }
        )
      }
      if (!range.ok) {
        return NextResponse.json(
          { error: `Date range too large for ${granularity} granularity.` },
          { status: 400 }
        )
      }
      customRange = range
    }

    // Create service role client to access private schema functions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    // Handle different time ranges
    if (!customRange) {
      // Simple hour-based query
      const now = new Date()
      const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000)
      
      const { data, error } = await supabase
        .rpc('get_streaming_stats', {
          p_start_date: start.toISOString(),
          p_end_date: now.toISOString(),
          p_granularity: granularity,
          p_streamed_only: streamedOnly
        })

      if (error) {
        console.error('Error fetching streaming stats:', error)
        throw new Error('Failed to fetch streaming stats: ' + error.message)
      }

      // Calculate totals
      const totalTweets = data?.reduce((sum: number, item: any) => sum + (item.tweet_count || 0), 0) || 0
      const maxUniqueScrapers = data?.reduce((max: number, item: any) => Math.max(max, item.unique_scrapers || 0), 0) || 0
      const avgTweetsPerPeriod = data?.length ? Math.round(totalTweets / data.length) : 0

      const response = {
        data,
        summary: {
          totalTweets,
          uniqueScrapers: maxUniqueScrapers,
          avgTweetsPerPeriod,
          periodsIncluded: data?.length || 0
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Cache for 5 minutes for current data
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
      }

      return NextResponse.json(response, { headers })
    }
    
    // Handle custom date ranges
    if (customRange) {
      const { data, error } = await supabase
        .rpc('get_streaming_stats', {
          p_start_date: customRange.start.toISOString(),
          p_end_date: customRange.end.toISOString(),
          p_granularity: granularity,
          p_streamed_only: streamedOnly
        })

      if (error) {
        console.error('Error fetching streaming stats:', error)
        throw new Error('Failed to fetch streaming stats: ' + error.message)
      }

      // Calculate totals
      const totalTweets = data?.reduce((sum: number, item: any) => sum + (item.tweet_count || 0), 0) || 0
      const maxUniqueScrapers = data?.reduce((max: number, item: any) => Math.max(max, item.unique_scrapers || 0), 0) || 0
      const avgTweetsPerPeriod = data?.length ? Math.round(totalTweets / data.length) : 0

      const response = {
        data,
        summary: {
          totalTweets,
          uniqueScrapers: maxUniqueScrapers,
          avgTweetsPerPeriod,
          periodsIncluded: data?.length || 0
        }
      }

      // Cache headers
      const now = new Date()
      const end = customRange.end
      const isCurrentPeriod = end > new Date(now.getTime() - 60 * 60 * 1000) // Within last hour
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': isCurrentPeriod ? 
          's-maxage=300, stale-while-revalidate=600' : // 5 min for current
          's-maxage=3600, stale-while-revalidate=7200'  // 1 hour for historical
      }

      return NextResponse.json(response, { headers })
    }
    
    return NextResponse.json(
      { error: 'Please provide either hoursBack parameter or both startDate and endDate' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in scraping-stats API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scraping stats' },
      { status: 500 }
    )
  }
}
