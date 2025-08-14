import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    if (!startDate && !endDate) {
      // Simple hour-based query
      const now = new Date()
      const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000)
      
      const { data, error } = await supabase
        .rpc('get_streaming_stats', {
          p_start_date: start.toISOString(),
          p_end_date: now.toISOString(),
          p_granularity: granularity
        })

      if (error) {
        console.error('Error fetching streaming stats:', error)
        throw new Error('Failed to fetch streaming stats: ' + error.message)
      }

      // Calculate totals
      const totalTweets = data?.reduce((sum, item) => sum + (item.tweet_count || 0), 0) || 0
      const maxUniqueScrapers = data?.reduce((max, item) => Math.max(max, item.unique_scrapers || 0), 0) || 0
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
    if (startDate && endDate) {
      const { data, error } = await supabase
        .rpc('get_streaming_stats', {
          p_start_date: startDate,
          p_end_date: endDate,
          p_granularity: granularity
        })

      if (error) {
        console.error('Error fetching streaming stats:', error)
        throw new Error('Failed to fetch streaming stats: ' + error.message)
      }

      // Calculate totals
      const totalTweets = data?.reduce((sum, item) => sum + (item.tweet_count || 0), 0) || 0
      const maxUniqueScrapers = data?.reduce((max, item) => Math.max(max, item.unique_scrapers || 0), 0) || 0
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
      const end = new Date(endDate)
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

