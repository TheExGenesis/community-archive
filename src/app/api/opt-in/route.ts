import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const admin = createServerAdminClient(cookieStore)
    const body = await request.json()
    const {
      username,
      twitterUserId,
      optedIn,
      termsVersion,
      explicitOptOut = false,
      optOutReason = null,
    } = body
    const normalizedUsername = username
      ?.toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '')

    // Validate required fields
    if (!normalizedUsername) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    const [byUserIdResponse, byUsernameResponse] = await Promise.all([
      admin.from('optin').select('*').eq('user_id', user.id).maybeSingle(),
      admin
        .from('optin')
        .select('*')
        .eq('username', normalizedUsername)
        .maybeSingle(),
    ])

    if (byUserIdResponse.error) {
      console.error('Error fetching opt-in status:', byUserIdResponse.error)
      return NextResponse.json(
        { error: 'Failed to fetch opt-in status' },
        { status: 500 }
      )
    }

    if (byUsernameResponse.error) {
      console.error('Error fetching username opt-in row:', byUsernameResponse.error)
      return NextResponse.json(
        { error: 'Failed to fetch opt-in status' },
        { status: 500 }
      )
    }

    const existingRecord = byUserIdResponse.data ?? byUsernameResponse.data

    if (
      byUsernameResponse.data?.user_id &&
      byUsernameResponse.data.user_id !== user.id
    ) {
      return NextResponse.json(
        { error: 'This username is already registered by another user' },
        { status: 400 }
      )
    }

    let result
    const nextExplicitOptOut = optedIn ? false : Boolean(explicitOptOut)
    const payload = {
      user_id: user.id,
      username: normalizedUsername,
      twitter_user_id: twitterUserId || null,
      opted_in: Boolean(optedIn) && !nextExplicitOptOut,
      terms_version: optedIn
        ? termsVersion
        : existingRecord?.terms_version ?? termsVersion ?? 'v1.0',
      explicit_optout: nextExplicitOptOut,
      opt_out_reason: nextExplicitOptOut
        ? optOutReason || 'User explicitly opted out via profile settings'
        : null,
    }

    if (existingRecord) {
      const { data, error } = await admin
        .from('optin')
        .update(payload)
        .eq('id', existingRecord.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating opt-in status:', error)
        return NextResponse.json(
          { error: 'Failed to update opt-in status' },
          { status: 500 }
        )
      }

      result = data
    } else {
      const { data, error } = await admin
        .from('optin')
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error('Error creating opt-in record:', error)
        
        // Check if username is already taken
        if (error.code === '23505' && error.message.includes('username')) {
          return NextResponse.json(
            { error: 'This username is already registered by another user' },
            { status: 400 }
          )
        }
        
        return NextResponse.json(
          { error: 'Failed to create opt-in record' },
          { status: 500 }
        )
      }

      result = data
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: optedIn 
        ? 'Successfully opted in to tweet streaming' 
        : 'Successfully opted out of tweet streaming'
    })

  } catch (error) {
    console.error('Unexpected error in opt-in API:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's opt-in status
    const { data, error } = await supabase
      .from('optin')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching opt-in status:', error)
      return NextResponse.json(
        { error: 'Failed to fetch opt-in status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || null,
      isOptedIn: data?.opted_in || false
    })

  } catch (error) {
    console.error('Unexpected error in opt-in API:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
