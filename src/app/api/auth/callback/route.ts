import { NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib/devLog'

// Validate host against allowed domains - prevents open redirect attacks
function isAllowedHost(host: string): boolean {
  // Check against configured allowed domains from env
  const allowedDomainsEnv = process.env.NEXT_ALLOWED_AUTH_REDIRECT_DOMAINS || ''
  const allowedDomains = allowedDomainsEnv
    .split(',')
    .map(d => d.trim().replace(/^https?:\/\//, '')) // Strip protocol
    .filter(Boolean)

  if (allowedDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) {
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

  // Validate 'next' parameter to prevent redirect to external URLs
  const safeNext = next.startsWith('/') ? next : '/'

  if (code) {
    const supabase = createServerAdminClient(cookies())
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    devLog({ data, error, next: safeNext, origin, code })
    if (!error && data.user) {
      // Move provider_id to app_metadata and ensure username is lowercase
      const { data: updateData, error: updateError } =
        await supabase.auth.admin.updateUserById(data.user.id, {
          app_metadata: {
            provider_id: data.user.user_metadata.provider_id,
            user_name: data.user.user_metadata.user_name.toLowerCase(),
          },
        })

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

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
