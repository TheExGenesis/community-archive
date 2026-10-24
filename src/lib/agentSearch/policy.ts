import { createServerServiceRoleClient } from '@/utils/supabase'

/**
 * Whether PostgreSQL policy withholds an account from serving: an explicit
 * opt-out or a scrape block. The same check as `isPolicyBlockedAccount` in
 * `@/lib/metaTwitter/data`, which this can't import: that module pulls in
 * `next/cache`, and the Workflow step bundle can't resolve Next's tracing.
 */
export async function isPolicyBlockedAccount(
  accountId: string,
  username: string,
): Promise<boolean> {
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('policy_account_is_blocked', {
    p_account_id: accountId,
    p_username: username,
  })
  if (error) throw error
  return data !== false
}
