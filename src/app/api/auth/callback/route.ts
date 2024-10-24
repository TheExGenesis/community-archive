import { NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib-client/devLog'

// Add this function to validate URLs
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const allowedDomains =
      process.env.NEXT_ALLOWED_AUTH_REDIRECT_DOMAINS?.split(',').map(
        (domain) => {
          try {
            return new URL(domain.trim()).hostname
          } catch {
            return domain.trim() // for 'localhost'
          }
        },
      ) || []
    return allowedDomains.includes(parsedUrl.hostname)
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const { searchParams, origin } = requestUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const forwardedHost = request.headers.get('x-forwarded-host')

  console.log('request.url', {
    request,
    url: request.url,
    allParams: Object.fromEntries(requestUrl.searchParams),
    headers: Object.fromEntries(request.headers),
    state: requestUrl.searchParams.get('state'),
    error: requestUrl.searchParams.get('error'),
    errorDescription: requestUrl.searchParams.get('error_description'),
    code,
    next,
    origin,
    forwardedHost,
    searchParams,
    customUrlParam: searchParams.get('customUrlParam'),
  })

  if (code) {
    const supabase = createServerAdminClient(cookies())
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    devLog({ data, error, next, origin, code, forwardedHost })
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

      // Determine base URL
      // const baseUrl = forwardedHost ? `https://${forwardedHost}` : origin
      const baseUrl = origin ? origin : `https://${forwardedHost}`

      // Determine redirect URL
      let redirectUrl = `${baseUrl}${next}`
      if (isValidRedirectUrl(next)) {
        redirectUrl = next
      }
      console.log('redirectUrl', { redirectUrl, next, origin, forwardedHost })

      return NextResponse.redirect(redirectUrl)
    }
  }

  const errorRedirect = forwardedHost
    ? `https://${forwardedHost}/auth/auth-code-error`
    : `${origin}/auth/auth-code-error`

  return NextResponse.redirect(errorRedirect)
}
