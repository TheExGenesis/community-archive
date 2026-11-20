import 'server-only'
import { unstable_cache } from 'next/cache'
import type { MentionedUser } from '@/components/TopMentionedMissingUsers'
import { fetchTopMentionedUsers } from '@/lib/clickhouseCorpusReads'

/**
 * "Most Wanted" on /mission-control: the most-mentioned accounts across the
 * archive, ranked by the ClickHouse gateway's top-mentioned route (which
 * keeps its own 6-hour ranking). The page is public, so the list is also
 * shared from the Data Cache for an hour rather than read per request.
 * Failures throw inside the cache and are not cached.
 */
const cachedArchiveMostMentionedAccounts = unstable_cache(
  async (): Promise<MentionedUser[]> =>
    (await fetchTopMentionedUsers(10)).map((user) => ({
      mentioned_user_id: user.accountId,
      screen_name: user.screenName,
      mention_count: Number(user.mentionCount) || 0,
      account_display_name: user.name ?? undefined,
      avatar_media_url: user.avatarMediaUrl,
      uploaded: user.hasArchive,
    })),
  ['archive-most-mentioned-accounts-v2'],
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
