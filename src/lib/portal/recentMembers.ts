import 'server-only'
import { unstable_cache } from 'next/cache'
import { fetchPortalRecentMemberCount, portalDataSourceKey } from './data'

// joined_at is the first archive/opt-in date, not the Twitter creation date
// or the latest upload. user_directory already deduplicates and excludes opt-outs.
const readRecentMemberCount = unstable_cache(
  async (_sourceKey: string) => fetchPortalRecentMemberCount(),
  ['homepage-recent-members-v2'],
  { revalidate: 60, tags: ['homepage-recent-members'] },
)

export const getRecentMemberCount = () =>
  readRecentMemberCount(portalDataSourceKey())
