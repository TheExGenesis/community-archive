import { NextRequest, NextResponse } from 'next/server'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

const PRODUCTION_SUPABASE_HOST = 'fabxmporizzqflnftavs.supabase.co'

const isDevelopment = () => process.env.NODE_ENV === 'development'

const isStagingDevLoginEnabled = () =>
  process.env.ENABLE_STAGING_DEV_LOGIN === 'true'

const isKnownProductionSupabase = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(PRODUCTION_SUPABASE_HOST) ??
  false

const getStagingLoginConfig = () => ({
  email: process.env.STAGING_DEV_LOGIN_EMAIL ?? 'dev@example.com',
  password: process.env.STAGING_DEV_LOGIN_PASSWORD,
  username: process.env.STAGING_DEV_LOGIN_USERNAME ?? 'alice_dev',
  providerId: process.env.STAGING_DEV_LOGIN_PROVIDER_ID ?? 'mock_alice',
  displayName: process.env.STAGING_DEV_LOGIN_DISPLAY_NAME ?? 'Staging User',
})

export async function POST(request: NextRequest) {
  const allowDevLogin = isDevelopment() || isStagingDevLoginEnabled()

  if (!allowDevLogin) {
    return NextResponse.json(
      { error: 'Dev login is disabled for this environment' },
      { status: 403 },
    )
  }

  if (
    !isDevelopment() &&
    isKnownProductionSupabase() &&
    process.env.ALLOW_STAGING_DEV_LOGIN_ON_PROD_SUPABASE !== 'true'
  ) {
    return NextResponse.json(
      {
        error:
          'Refusing staging dev login against the production Supabase project',
      },
      { status: 500 },
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const adminSupabase = createServerAdminClient(cookieStore)

  try {
    const body = await request.json().catch(() => ({}))
    const stagingConfig = getStagingLoginConfig()

    if (!isDevelopment() && !stagingConfig.password) {
      return NextResponse.json(
        { error: 'STAGING_DEV_LOGIN_PASSWORD must be set for staging login' },
        { status: 500 },
      )
    }

    const email = isDevelopment()
      ? (body.email ?? stagingConfig.email)
      : stagingConfig.email
    const password = isDevelopment()
      ? (body.password ?? stagingConfig.password ?? 'devpassword123')
      : stagingConfig.password
    const username = stagingConfig.username.toLowerCase()

    // Try to sign in first
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (signInError) {
      // If sign in fails, try to create the account
      if (signInError.message.includes('Invalid login credentials')) {
        const { error: createError } =
          await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: stagingConfig.displayName,
              user_name: username,
              provider_id: stagingConfig.providerId,
              provider: isDevelopment() ? 'email' : 'staging',
            },
            app_metadata: {
              provider_id: stagingConfig.providerId,
              user_name: username,
              provider: isDevelopment() ? 'email' : 'staging',
            },
          })

        if (createError) {
          return NextResponse.json(
            { error: `Failed to create dev account: ${createError.message}` },
            { status: 400 },
          )
        }

        // Try to sign in again after creating the account
        const { data: retryData, error: retryError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          })

        if (retryError) {
          return NextResponse.json(
            {
              error: `Failed to sign in after creating account: ${retryError.message}`,
            },
            { status: 400 },
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Dev account created and signed in successfully',
          user: retryData.user,
        })
      } else {
        return NextResponse.json(
          { error: signInError.message },
          { status: 400 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Signed in successfully',
      user: signInData.user,
    })
  } catch (error: any) {
    console.error('Dev login error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    )
  }
}
