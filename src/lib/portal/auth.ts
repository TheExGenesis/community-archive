import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'

/**
 * Whether the current request comes from a signed-in member.
 * In development, the `dev_as_member` cookie (set by visiting any page with
 * `?as=member`, cleared with `?as=guest`) also counts, so the signed-in
 * experience can be previewed without an account.
 */
export async function getIsMember(): Promise<boolean> {
  const cookieStore = cookies()
  if (
    process.env.NODE_ENV === 'development' &&
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
