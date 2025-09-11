import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Dev login is only available in development mode' },
      { status: 403 }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  try {
    const body = await request.json()
    const { email = 'dev@example.com', password = 'devpassword123' } = body

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      // If sign in fails, try to create the account
      if (signInError.message.includes('Invalid login credentials')) {
        // First, sign up the user
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: 'Dev User',
              user_name: 'devuser',
              provider: 'email',
            }
          }
        })

        if (signUpError) {
          return NextResponse.json(
            { error: `Failed to create dev account: ${signUpError.message}` },
            { status: 400 }
          )
        }

        // Try to sign in again after creating the account
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (retryError) {
          return NextResponse.json(
            { error: `Failed to sign in after creating account: ${retryError.message}` },
            { status: 400 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Dev account created and signed in successfully',
          user: retryData.user
        })
      } else {
        return NextResponse.json(
          { error: signInError.message },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Signed in successfully',
      user: signInData.user
    })
  } catch (error: any) {
    console.error('Dev login error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}