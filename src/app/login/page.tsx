import { redirect } from 'next/navigation'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import LoginContent from './LoginContent'
import { safeAuthRedirect } from '@/lib/authRedirect'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string }
}) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const returnTo = safeAuthRedirect(searchParams.redirect)
  if (user) redirect(returnTo)

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent redirectUrl={returnTo} />
    </Suspense>
  )
}
