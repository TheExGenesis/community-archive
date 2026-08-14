import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'

const accountPattern = /^\d{1,20}$/

export async function getAuthenticatedAccountId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const accountId = user?.app_metadata?.provider_id
    return typeof accountId === 'string' && accountPattern.test(accountId)
      ? accountId
      : null
  } catch {
    return null
  }
}
