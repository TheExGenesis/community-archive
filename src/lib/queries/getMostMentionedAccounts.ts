import 'server-only'
import { unstable_cache } from 'next/cache'
import type { MentionedUser } from '@/components/TopMentionedMissingUsers'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { productionReadCacheKey } from '@/utils/supabaseReadRouting'
import { devLog } from '../devLog'

/**
 * "Most Wanted" on /mission-control: the most-mentioned accounts across the
 * archive. The page is public, so this must not run a corpus RPC as anon or
 * per request: it reads with the server's service role (anonymous corpus
 * access is revoked) and is shared from the Data Cache for an hour. An hour
 * matches the other aggregate panels; the list holds handles and counts, and
 * opt-outs are removed from the mention tables at ingestion.
 */
const cachedArchiveMostMentionedAccounts = unstable_cache(
  async (): Promise<MentionedUser[]> => {
    const supabase = createServerServiceRoleClient()
    const { data: rawUsers, error } = await supabase.rpc(
      'get_top_mentioned_users',
      { limit_: 10 },
    )

    if (error || !rawUsers) {
      // Throw so a failure is not cached as an empty list.
      throw new Error(
        `get_top_mentioned_users failed: ${error?.message ?? 'no data'}`,
      )
    }

    const users = rawUsers
    devLog('users', users)
    const userIds = users.map((user: any) => user.user_id)

    const [{ data: profiles }, { data: accounts }] = await Promise.all([
      supabase
        .from('profile')
        .select('*')
        .in('account_id', userIds)
        .order('archive_upload_id', { ascending: false }),
      supabase.from('account').select('*').in('account_id', userIds),
    ])

    return users.map((user: any) => {
      const profile = profiles?.find((p) => p.account_id === user.user_id)
      const account = accounts?.find((a) => a.account_id === user.user_id)
      return {
        mentioned_user_id: user.user_id,
        screen_name: user.screen_name,
        mention_count: user.mention_count,
        account_display_name: user.name,
        avatar_media_url: profile?.avatar_media_url,
        uploaded: !!account,
      }
    })
  },
  ['archive-most-mentioned-accounts-v1', productionReadCacheKey()],
  { revalidate: 3600 },
)

export async function getArchiveMostMentionedAccounts(): Promise<
  MentionedUser[]
> {
  try {
    return await cachedArchiveMostMentionedAccounts()
  } catch (error) {
    console.error('Error fetching most mentioned accounts:', error)
    return []
  }
}
