import { NextRequest, NextResponse } from 'next/server'
import { isProductionSupabaseUrl } from '@/lib/isProductionSupabaseUrl'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

const isDevelopment = () => process.env.NODE_ENV === 'development'

const isStagingDevLoginEnabled = () =>
  process.env.ENABLE_STAGING_DEV_LOGIN === 'true'

const isKnownProductionSupabase = () =>
  isProductionSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)

// Defense-in-depth: this route must be physically inert whenever the configured
// Supabase URL points at the prod project, regardless of
// `ENABLE_STAGING_DEV_LOGIN`. The route lets callers choose
// `username` / `providerId` and writes them into `app_metadata.user_name`,
// which is what the admin allowlist in `src/app/admin/data.ts` consults —
// so a single env flip would otherwise let any client mint an admin session.
// Do not gate on NODE_ENV: deployed staging/preview builds correctly use
// NODE_ENV=production and still need the explicitly enabled staging login.
const isHardDisabledEnvironment = isKnownProductionSupabase

// Evaluate at module load so that a misconfigured prod deploy fails fast
// (in addition to the per-request 404 below). This is intentionally a
// `const` and not a function — capturing the value at import time means
// runtime env mutation cannot re-enable the route.
const HARD_DISABLED_AT_LOAD = isHardDisabledEnvironment()
if (HARD_DISABLED_AT_LOAD) {
  // eslint-disable-next-line no-console
  console.warn(
    '[security] /api/auth/dev-login is hard-disabled because NEXT_PUBLIC_SUPABASE_URL points at the prod Supabase project. All requests will 404.',
  )
}

const getStagingLoginConfig = () => ({
  email: process.env.STAGING_DEV_LOGIN_EMAIL ?? 'dev@example.com',
  password: process.env.STAGING_DEV_LOGIN_PASSWORD,
  username: process.env.STAGING_DEV_LOGIN_USERNAME ?? 'alice_dev',
  providerId: process.env.STAGING_DEV_LOGIN_PROVIDER_ID ?? 'mock_alice',
  displayName: process.env.STAGING_DEV_LOGIN_DISPLAY_NAME ?? 'Staging User',
})

// Staging signs in as one of the seeded mock accounts. The username chosen by the client
// picks the provider_id (which delete/admin checks rely on); the password is shared across
// mock users because they all live on a staging-only auth backend.
const STAGING_EMAIL_DOMAIN = 'staging.local'

export async function POST(request: NextRequest) {
  // Hard gate: refuse unconditionally if this build/runtime is pointed at the
  // production Supabase project. Returns 404 to make the route
  // indistinguishable from a non-existent endpoint.
  if (HARD_DISABLED_AT_LOAD || isHardDisabledEnvironment()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const allowDevLogin = isDevelopment() || isStagingDevLoginEnabled()

  if (!allowDevLogin) {
    return NextResponse.json(
      { error: 'Dev login is disabled for this environment' },
      { status: 403 },
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

    // In staging, the client may pick which seeded mock user to sign in as by passing
    // `username` / `providerId` / `displayName`. When unspecified, fall back to the
    // env-configured defaults (currently alice_dev). In dev, body.email/password still wins.
    const username = (
      body.username ??
      (isDevelopment() ? undefined : stagingConfig.username) ??
      stagingConfig.username
    )
      .toString()
      .toLowerCase()
    const providerId =
      (body.providerId as string | undefined) ?? stagingConfig.providerId
    const displayName =
      (body.displayName as string | undefined) ?? stagingConfig.displayName

    const email = isDevelopment()
      ? (body.email ?? stagingConfig.email)
      : body.username
        ? `${username}@${STAGING_EMAIL_DOMAIN}`
        : stagingConfig.email
    const password = isDevelopment()
      ? (body.password ?? stagingConfig.password ?? 'devpassword123')
      : stagingConfig.password

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
              full_name: displayName,
              user_name: username,
              provider_id: providerId,
              provider: isDevelopment() ? 'email' : 'staging',
            },
            app_metadata: {
              provider_id: providerId,
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
