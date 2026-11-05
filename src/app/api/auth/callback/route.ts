import { NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { buildAuthErrorUrl } from '@/lib/authCallback'
import { safeAuthRedirect } from '@/lib/authRedirect'
import { getTwitterProviderId, getTwitterUsername } from '@/lib/twitterIdentity'

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
  const safeNext = safeAuthRedirect(next)

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
    const supabase = createServerAdminClient(await cookies())
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
      // RLS, storage policies and the archive RPCs trust app_metadata, so copy
      // the account from the Twitter/X identity Supabase Auth just verified,
      // never from user_metadata, which the client can rewrite. The
      // sync_user_meta_data trigger derives the same values from
      // auth.identities on every update (migration 20261016192016); this
      // write covers stacks where that trigger is not yet installed.
      const providerId = getTwitterProviderId(data.user)
      const username = getTwitterUsername(data.user)

      if (providerId) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          data.user.id,
          {
            app_metadata: {
              provider_id: providerId,
              ...(username ? { user_name: username } : {}),
            },
          },
        )

        if (updateError) {
          console.error('Failed to update app_metadata:', updateError)
        }
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
