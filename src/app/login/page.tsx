import { redirect } from 'next/navigation'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import LoginContent from './LoginContent'

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

  if (user) {
    const requestedRedirect = searchParams.redirect
    const safeRedirect =
      requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')
        ? requestedRedirect
        : null

    if (safeRedirect) redirect(safeRedirect)

    redirect('/')
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent redirectUrl={searchParams.redirect} />
    </Suspense>
  )
}
