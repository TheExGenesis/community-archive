import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient(cookies())
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { username, twitterUserId, optedIn, termsVersion } = body

    // Validate required fields
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Check if user already has an opt-in record
    const { data: existingRecord, error: fetchError } = await supabase
      .from('optin')
      .select('*')
      .eq('user_id', user.id)
      .single()

    let result

    if (existingRecord) {
      // Update existing record
      const { data, error } = await supabase
        .from('optin')
        .update({
          username: username.toLowerCase(),
          twitter_user_id: twitterUserId,
          opted_in: optedIn,
          terms_version: optedIn ? termsVersion : existingRecord.terms_version,
        })
        .eq('user_id', user.id)
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
      // Create new record
      const { data, error } = await supabase
        .from('optin')
        .insert({
          user_id: user.id,
          username: username.toLowerCase(),
          twitter_user_id: twitterUserId,
          opted_in: optedIn,
          terms_version: termsVersion,
        })
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
    const supabase = createServerClient(cookies())
    
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