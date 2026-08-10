import 'server-only'
import * as React from 'react'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/utils/supabase'

type RequestCache = <T>(loader: () => Promise<T>) => () => Promise<T>
const withoutRequestCache: RequestCache = (loader) => loader

// Next's React Server Components runtime supplies React.cache(), while the
// repository's React 18 Jest runtime does not. Keep the test fallback local;
// production requests use React.cache() and deduplicate this auth round trip
// across layouts and pages.
const requestCache =
  (
    React as typeof React & {
      cache?: RequestCache
    }
  ).cache ?? withoutRequestCache

/**
 * Member preview is available in development always, and on deployments that
 * explicitly opt in (e.g. a staging/preview deploy where X sign-in isn't
 * wired up). It only unlocks the portal UI over public data — it never
 * creates a session or touches auth. Leave the flag unset in production.
 */
export const isMemberPreviewEnabled = () =>
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW === 'true'

export const getCurrentUser = requestCache(async (): Promise<User | null> => {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error ? null : user
})

/**
 * Whether the current request comes from a signed-in member.
 * Where member preview is enabled, the `dev_as_member` cookie (set by
 * visiting any page with `?as=member`, cleared with `?as=guest`) also counts,
 * so the signed-in experience can be previewed without an account.
 */
export async function getIsMember(): Promise<boolean> {
  const cookieStore = cookies()
  if (
    isMemberPreviewEnabled() &&
    cookieStore.get('dev_as_member')?.value === '1'
  ) {
    return true
  }
  return !!(await getCurrentUser())
}
