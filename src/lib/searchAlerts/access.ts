import 'server-only'

import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import { getCurrentUser } from '@/lib/portal/auth'

/**
 * Who may use search alerts. Admins only at launch; to open alerts to every
 * signed-in user, make this return true.
 */
export const canUseSearchAlertsUser = (user: User): boolean => isAdminUser(user)

/** Whether the current request's user may use search alerts. */
export async function canUseSearchAlerts(): Promise<boolean> {
  const user = await getCurrentUser()
  return user ? canUseSearchAlertsUser(user) : false
}

export const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

export const privateJson = (body: unknown, init: { status?: number } = {}) =>
  NextResponse.json(body, { status: init.status, headers: PRIVATE_NO_STORE })

/**
 * The signed-in user allowed to use search alerts, or the 401/403 response to
 * return. Runs no database or gateway query beyond the session check.
 */
export async function searchAlertsUser(): Promise<
  { user: User; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      response: privateJson({ error: 'Sign in first.' }, { status: 401 }),
    }
  }
  if (!canUseSearchAlertsUser(user)) {
    return {
      response: privateJson(
        { error: 'Search alerts are not available for this account.' },
        { status: 403 },
      ),
    }
  }
  return { user }
}
