import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'

/**
 * Member preview is available in development always, and on deployments that
 * explicitly opt in (e.g. a staging/preview deploy where X sign-in isn't
 * wired up). It only unlocks the portal UI over public data — it never
 * creates a session or touches auth. Leave the flag unset in production.
 */
export const isMemberPreviewEnabled = () =>
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW === 'true'

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
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}
