/**
 * Whether PostgreSQL policy withholds an account from serving: an explicit
 * opt-out or a scrape block. The same check as `isPolicyBlockedAccount` in
 * `@/lib/metaTwitter/data`, which this can't import: that module pulls in
 * `next/cache`, and the Workflow step bundle can't resolve Next's tracing.
 *
 * The client is imported here, not at the top: toolImpl is reachable from
 * workflow code, and loading `@/utils/supabase` there runs `require` for
 * `next/server`, which the workflow sandbox doesn't have. Only steps call this.
 */
export async function isPolicyBlockedAccount(
  accountId: string,
  username: string,
): Promise<boolean> {
  const { createServerServiceRoleClient } = await import('@/utils/supabase')
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('policy_account_is_blocked', {
    p_account_id: accountId,
    p_username: username,
  })
  if (error) throw error
  return data !== false
}
