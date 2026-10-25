import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'

// joined_at is the first archive/opt-in date, not the Twitter creation date
// or the latest upload. user_directory already deduplicates and excludes opt-outs.
export const getRecentMemberCount = unstable_cache(
  async () => {
    const now = Date.now()
    const { count, error } = await createServerServiceRoleClient({
      noStore: true,
    })
      .from('user_directory')
      .select('*', { count: 'exact', head: true })
      .gte('joined_at', new Date(now - 86_400_000).toISOString())
      .lte('joined_at', new Date(now).toISOString())
    if (error || count === null) throw new Error('Recent members unavailable')
    return count
  },
  ['homepage-recent-members-v1', process.env.VERCEL_ENV ?? 'local'],
  { revalidate: 60, tags: ['homepage-recent-members'] },
)
