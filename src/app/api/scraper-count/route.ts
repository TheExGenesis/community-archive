import { NextRequest, NextResponse } from 'next/server'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  MAX_AGGREGATE_RANGE_MS,
  validateDateRange,
} from '@/lib/apiInputValidation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDateRaw = searchParams.get('startDate')
    const endDateRaw = searchParams.get('endDate')

    if (!startDateRaw || !endDateRaw) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      )
    }

    const range = validateDateRange(
      startDateRaw,
      endDateRaw,
      MAX_AGGREGATE_RANGE_MS,
    )

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
        { error: 'Date range too large. Maximum 365 days.' },
        { status: 400 }
      )
    }

    // Use the real service-role client to access SECURITY DEFINER RPCs that
    // read from `private.tweet_user`. `createServerAdminClient` is the SSR
    // helper that forwards the user JWT — it would not actually be elevated.
    const supabase = createServerServiceRoleClient()

    const { data: countData, error: countError } = await supabase
      .rpc('get_unique_scraper_count', {
        start_date: range.start.toISOString(),
        end_date: range.end.toISOString()
      })

    if (countError) {
      console.error('Error calling get_unique_scraper_count RPC:', countError)
      return NextResponse.json(
        { error: 'Failed to fetch scraper count' },
        { status: 500 }
      )
    }

    const count = countData || 0

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
