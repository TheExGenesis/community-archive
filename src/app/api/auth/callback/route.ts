import { NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { buildAuthErrorUrl } from '@/lib/authCallback'

// Validate host against allowed domains - prevents open redirect attacks
function isAllowedHost(host: string): boolean {
  // Check against configured allowed domains from env
  const allowedDomainsEnv = process.env.NEXT_ALLOWED_AUTH_REDIRECT_DOMAINS || ''
  const allowedDomains = allowedDomainsEnv
    .split(',')
    .map((d) => d.trim().replace(/^https?:\/\//, '')) // Strip protocol
    .filter(Boolean)

  if (
    allowedDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return true
  }

  // Always allow localhost for development
  if (host === 'localhost' || host.startsWith('localhost:')) {
    return true
  }

  // Allow Vercel preview deployments (*.vercel.app)
  if (host.endsWith('.vercel.app')) {
    return true
  }

  // Allow configured VERCEL_URL
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl && host === vercelUrl) {
    return true
  }

  return false
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const providerError = searchParams.get('error')
  const providerErrorCode = searchParams.get('error_code')
  const providerErrorDescription = searchParams.get('error_description')

  // Validate 'next' parameter to prevent redirect to external URLs
  const safeNext = next.startsWith('/') ? next : '/'

  if (providerError) {
    console.warn('OAuth provider rejected sign-in', {
      error: providerError,
      errorCode: providerErrorCode,
      errorDescription: providerErrorDescription,
    })

    return NextResponse.redirect(
      buildAuthErrorUrl(origin, {
        error: providerError,
        errorCode: providerErrorCode,
        errorDescription: providerErrorDescription,
      }),
    )
  }

  if (code) {
    const supabase = createServerAdminClient(cookies())
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Failed to exchange OAuth code for a session', error)
      return NextResponse.redirect(
        buildAuthErrorUrl(origin, {
          error: 'session_exchange_failed',
        }),
      )
    }

    if (!error && data.user) {
      // Move provider_id to app_metadata and ensure username is lowercase
      const providerId = data.user.user_metadata.provider_id
      const rawUsername = data.user.user_metadata.user_name
      const username =
        typeof rawUsername === 'string' ? rawUsername.toLowerCase() : null

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        {
          app_metadata: {
            ...(providerId ? { provider_id: providerId } : {}),
            ...(username ? { user_name: username } : {}),
          },
        },
      )

      if (updateError) {
        console.error('Failed to update app_metadata:', updateError)
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv =
        process.env.NODE_ENV === 'development' &&
        !process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${safeNext}`)
      } else if (forwardedHost && isAllowedHost(forwardedHost)) {
        // SECURITY: Only redirect to validated hosts
        return NextResponse.redirect(`https://${forwardedHost}${safeNext}`)
      } else {
        return NextResponse.redirect(`${origin}${safeNext}`)
      }
    }
  }

  return NextResponse.redirect(
    buildAuthErrorUrl(origin, { error: 'missing_authorization_code' }),
  )
}
