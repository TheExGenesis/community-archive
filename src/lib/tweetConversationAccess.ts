import 'server-only'
import { cache } from 'react'
import { getCurrentUser } from '@/lib/portal/auth'
import { getOptInStatus } from '@/lib/auth-utils'

// Live PostgreSQL consent, shared only within the current request. Preview
// cookies and client-editable metadata never authorize conversation reads.
export const canReadTweetConversation = cache(async (): Promise<boolean> => {
  try {
    const user = await getCurrentUser()
    if (!user || user.is_anonymous) return false
    const { data, error } = await getOptInStatus(user.id)
    return !error && data?.opted_in === true && data.explicit_optout !== true
  } catch {
    return false
  }
})
