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
    
    // Use the simplified function for hourly stats
    if (!startDate && !endDate && granularity === 'hour') {
      const { data, error } = await supabase
        .rpc('get_hourly_scraping_stats', {
          p_hours_back: hoursBack
        })

      if (error) {
        console.error('Error fetching scraping stats:', error)
        throw new Error('Failed to fetch scraping stats')
      }

      // Calculate totals with fixed unique scrapers calculation
      const totalTweets = data?.reduce((sum, item) => sum + (item.tweet_count || 0), 0) || 0
      const maxUniqueScrapers = data?.reduce((max, item) => Math.max(max, item.unique_scrapers || 0), 0) || 0
      const avgTweetsPerHour = data?.length ? Math.round(totalTweets / data.length) : 0

      const response = {
        data,
        summary: {
          totalTweets,
          uniqueScrapers: maxUniqueScrapers,
          avgTweetsPerHour,
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
    
    // For now, only support hourly stats
    return NextResponse.json(
      { error: 'Currently only hourly stats are supported' },
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

