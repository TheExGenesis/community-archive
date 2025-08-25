import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const supabase = createServerClient(cookies())
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    redirect('/login?redirect=/opt-in')
  }
  
  return { user, supabase }
}

export async function getOptInStatus(userId: string) {
  const supabase = createServerClient(cookies())
  
  const { data, error } = await supabase
    .from('optin')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  return { data, error }
}