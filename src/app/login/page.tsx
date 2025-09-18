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
  const supabase = createServerClient(cookies())
  
  // Check if user is already logged in
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    // User is already logged in, redirect to intended page or home
    const redirectTo = searchParams.redirect || '/'
    redirect(redirectTo)
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent redirectUrl={searchParams.redirect} />
    </Suspense>
  )
}