import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const granularity = searchParams.get('granularity')

    if (!startDate || !endDate || granularity !== 'hour') {
      return NextResponse.json(
        { error: 'Only hour granularity supported for last 24 hours' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    
    const { data, error } = await supabase
      .rpc('get_simple_streamed_tweet_counts', {
        start_date: startDate,
        end_date: endDate,
        granularity: granularity,
      })

    if (error) {
      console.error('Error fetching tweet counts:', error)
      throw new Error('Failed to fetch tweet counts')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Short cache for real-time data
      'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' // 5 min cache, 1 hour stale
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