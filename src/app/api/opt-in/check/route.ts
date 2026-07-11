import { createServerClient } from '@/utils/supabase'
import { isTwitterUsername } from '@/lib/apiInputValidation'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const MAX_USERNAMES = 200

// Public endpoint to check if a username is opted in
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)

    const searchParams = request.nextUrl.searchParams
    const username = searchParams.get('username')
    const usernames = searchParams.get('usernames') // Comma-separated list

    if (!username && !usernames) {
      return NextResponse.json(
        { error: 'Username or usernames parameter is required' },
        { status: 400 }
      )
    }

    if (username && !isTwitterUsername(username)) {
      return NextResponse.json(
        { error: 'Invalid username format' },
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
      const rawList = usernames!.split(',').map(u => u.trim()).filter(Boolean)

      if (rawList.length === 0) {
        return NextResponse.json(
          { error: 'At least one username is required' },
          { status: 400 }
        )
      }

      if (rawList.length > MAX_USERNAMES) {
        return NextResponse.json(
          { error: `Too many usernames. Maximum ${MAX_USERNAMES} per request.` },
          { status: 400 }
        )
      }

      // Reject if any username has invalid characters. Avoids leaking weird
      // values into the .in() filter and prevents wildcard/SQL-shaped input.
      for (const u of rawList) {
        if (!isTwitterUsername(u)) {
          return NextResponse.json(
            { error: 'One or more usernames have invalid format' },
            { status: 400 }
          )
        }
      }

      const usernameList = Array.from(
        new Set(rawList.map(u => u.toLowerCase()))
      )

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
