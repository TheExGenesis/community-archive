import { NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // console.log({ code, next, searchParams, origin, request })

  if (code) {
    const supabase = createServerAdminClient(cookies())
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    console.log({ data, error, next, origin, code })

    if (!error && data.user) {
      // Move provider_id to app_metadata
      const { data: updateData, error: updateError } =
        await supabase.auth.admin.updateUserById(data.user.id, {
          app_metadata: { provider_id: data.user.user_metadata.provider_id },
        })

      if (updateError) {
        console.error('Failed to update app_metadata:', updateError)
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv =
        process.env.NODE_ENV === 'development' &&
        !process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
