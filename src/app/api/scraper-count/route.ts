import { NextRequest, NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      )
    }

    // Use service role client for elevated permissions to access private schema
    const supabase = createServerAdminClient(cookies())
    
    console.log('Using service role client to access private.tweet_user table')
    console.log('Querying scrapers from', startDate, 'to', endDate)
    
    // Use RPC function to access private schema data
    const { data: countData, error: countError } = await supabase
      .rpc('get_unique_scraper_count', {
        start_date: startDate,
        end_date: endDate
      })
    
    if (countError) {
      console.error('Error calling get_unique_scraper_count RPC:', countError)
      return NextResponse.json(
        { error: `RPC query failed: ${countError.message}` },
        { status: 500 }
      )
    }
    
    const count = countData || 0

    console.log('RPC query result:', { 
      count: countData,
      error: countError
    })

    // Cache for 5 minutes
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=3600'
    }

    return NextResponse.json({ count }, { headers })
  } catch (error) {
    console.error('Error in scraper-count API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scraper count' },
      { status: 500 }
    )
  }
}