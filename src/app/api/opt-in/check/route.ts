import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Public endpoint to check if a username is opted in
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(cookies())
    
    const searchParams = request.nextUrl.searchParams
    const username = searchParams.get('username')
    const usernames = searchParams.get('usernames') // Comma-separated list

    if (!username && !usernames) {
      return NextResponse.json(
        { error: 'Username or usernames parameter is required' },
        { status: 400 }
      )
    }

    if (username) {
      // Single username check
      const { data, error } = await supabase
        .from('optin')
        .select('username, opted_in, twitter_user_id')
        .eq('username', username.toLowerCase())
        .eq('opted_in', true)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking opt-in status:', error)
        return NextResponse.json(
          { error: 'Failed to check opt-in status' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        username: username.toLowerCase(),
        isOptedIn: !!data,
        twitterUserId: data?.twitter_user_id || null
      })
    } else {
      // Multiple usernames check
      const usernameList = usernames!.split(',').map(u => u.trim().toLowerCase())
      
      const { data, error } = await supabase
        .from('optin')
        .select('username, opted_in, twitter_user_id')
        .in('username', usernameList)
        .eq('opted_in', true)

      if (error) {
        console.error('Error checking opt-in statuses:', error)
        return NextResponse.json(
          { error: 'Failed to check opt-in statuses' },
          { status: 500 }
        )
      }

      // Create a map of results
      const optedInMap: Record<string, { isOptedIn: boolean; twitterUserId?: string }> = {}
      
      // Initialize all usernames as not opted in
      usernameList.forEach(u => {
        optedInMap[u] = { isOptedIn: false }
      })
      
      // Mark opted-in users
      data?.forEach(record => {
        optedInMap[record.username] = {
          isOptedIn: true,
          twitterUserId: record.twitter_user_id || undefined
        }
      })

      return NextResponse.json({
        success: true,
        results: optedInMap
      })
    }

  } catch (error) {
    console.error('Unexpected error in opt-in check API:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}