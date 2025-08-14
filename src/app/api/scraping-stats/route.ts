import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hoursBack = parseInt(searchParams.get('hoursBack') || '24')
    const granularity = searchParams.get('granularity') || 'hour'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Validate input
    if (hoursBack < 1 || hoursBack > 720) { // Max 30 days
      return NextResponse.json(
        { error: 'Invalid hoursBack parameter. Must be between 1 and 720.' },
        { status: 400 }
      )
    }

    const supabase = createServerClient(cookies())
    
    // Use the stream monitor function for hourly stats
    if (!startDate && !endDate && granularity === 'hour') {
      const { data, error } = await supabase
        .rpc('get_stream_monitor_stats', {
          p_hours_back: hoursBack
        })

      if (error) {
        console.error('Error fetching scraping stats:', error)
        throw new Error('Failed to fetch scraping stats')
      }

      // Calculate totals
      const totals = data?.reduce((acc, item) => ({
        totalTweets: acc.totalTweets + (item.tweet_count || 0),
        uniqueScrapers: new Set([...acc.uniqueScrapers, ...(item.unique_scrapers ? [item.unique_scrapers] : [])]),
        avgTweetsPerHour: 0
      }), { totalTweets: 0, uniqueScrapers: new Set(), avgTweetsPerHour: 0 }) || { totalTweets: 0, uniqueScrapers: new Set(), avgTweetsPerHour: 0 }
      
      totals.avgTweetsPerHour = data?.length ? Math.round(totals.totalTweets / data.length) : 0

      const response = {
        data,
        summary: {
          totalTweets: totals.totalTweets,
          uniqueScrapers: totals.uniqueScrapers.size,
          avgTweetsPerHour: totals.avgTweetsPerHour,
          hoursIncluded: data?.length || 0
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Cache for 5 minutes for hourly data
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
      }

      return NextResponse.json(response, { headers })
    }
    
    // For custom date ranges, use the flexible function
    if (startDate && endDate) {
      const periodType = granularity === 'day' ? 'day' : 
                        granularity === 'week' ? 'week' : 
                        granularity === 'month' ? 'month' : 'hour'
      
      const { data, error } = await supabase
        .rpc('get_or_compute_scraping_stats', {
          p_start_date: startDate,
          p_end_date: endDate,
          p_granularity: periodType
        })

      if (error) {
        console.error('Error fetching scraping stats:', error)
        throw new Error('Failed to fetch scraping stats')
      }

      // Calculate summary
      const summary = data?.reduce((acc, item) => ({
        totalTweets: acc.totalTweets + (item.tweet_count || 0),
        uniqueScrapers: Math.max(acc.uniqueScrapers, item.unique_scrapers || 0),
        periodsIncluded: acc.periodsIncluded + 1,
        avgTweetsPerPeriod: 0
      }), { totalTweets: 0, uniqueScrapers: 0, periodsIncluded: 0, avgTweetsPerPeriod: 0 }) || 
      { totalTweets: 0, uniqueScrapers: 0, periodsIncluded: 0, avgTweetsPerPeriod: 0 }
      
      summary.avgTweetsPerPeriod = summary.periodsIncluded ? 
        Math.round(summary.totalTweets / summary.periodsIncluded) : 0

      const response = {
        data,
        summary
      }

      // Determine cache duration based on date range
      const now = new Date()
      const end = new Date(endDate)
      const isCurrentPeriod = end > now || (end.getTime() - now.getTime()) > -86400000 // Within last day
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Shorter cache for current periods, longer for historical
        'Cache-Control': isCurrentPeriod ? 
          's-maxage=300, stale-while-revalidate=600' : // 5 min for current
          's-maxage=3600, stale-while-revalidate=7200'  // 1 hour for historical
      }

      return NextResponse.json(response, { headers })
    }

    return NextResponse.json(
      { error: 'Invalid parameters. Provide either hoursBack or both startDate and endDate.' },
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

// POST endpoint to trigger cache refresh for admins
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient(cookies())
    
    // Check if user is authenticated (you might want to add admin check here)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Mark completed periods
    const { error } = await supabase
      .rpc('mark_completed_periods')

    if (error) {
      console.error('Error marking completed periods:', error)
      throw new Error('Failed to mark completed periods')
    }

    return NextResponse.json({ success: true, message: 'Completed periods marked successfully' })
  } catch (error) {
    console.error('Error in scraping-stats POST:', error)
    return NextResponse.json(
      { error: 'Failed to update scraping stats' },
      { status: 500 }
    )
  }
}