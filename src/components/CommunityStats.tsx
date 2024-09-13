import { getStats } from '@/lib-server/stats'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

const getRecentUploadedAccounts = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from('archive_upload')
    .select(
      `
      account:account (
        username,
        account_display_name,
        profile:profile (avatar_media_url)
      )
    `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching recent uploads:', error)
    return null
  }

  const uniqueAccounts = new Map()

  for (const item of data) {
    const account = item.account[0]
    if (account && !uniqueAccounts.has(account.username)) {
      uniqueAccounts.set(account.username, {
        username: account.username,
        avatar_media_url: account.profile?.[0]?.avatar_media_url,
      })
    }
  }

  return Array.from(uniqueAccounts.values()).slice(0, 7)
}

const calculateGoal = (accountCount: number): number => {
  const goals = [25, 50, 100, 250, 500, 750, 1000];
  if (accountCount < 25) return 25;
  return goals.find(goal => goal > accountCount) || goals[goals.length - 1];
};

interface CommunityStatsProps {
  showGoal?: boolean
}

const CommunityStats = async ({ showGoal }: CommunityStatsProps) => {
  const supabase = createServerClient(cookies())
  const [recentUploads, stats] = await Promise.all([
    getRecentUploadedAccounts(supabase),
    getStats(supabase).catch((error) => {
      console.error('Failed to fetch stats:', error)
      return {
        accountCount: null,
        tweetCount: null,
        likedTweetCount: null,
        usernames: null,
      }
    }),
  ])

  const goal = stats.accountCount !== null ? calculateGoal(stats.accountCount) : null;

  return (
    <div >
      {stats.accountCount !== null &&
        stats.tweetCount !== null &&
        stats.likedTweetCount !== null && (
          <>
            <strong>{stats.tweetCount}</strong> tweets contributed from <strong>{stats.accountCount}</strong> accounts.
            {showGoal && goal && (
              <span className="italic"> Next milestone: <strong>{goal}</strong> accounts.</span>
            )}
          </>
        )}
      {/* {stats.usernames && stats.usernames.length > 0 && (
        <p className="mb-4 text-sm">
          Accounts in the archive: <span dangerouslySetInnerHTML={{__html: usernames}}></span>
        </p>
      )} */}

      {/* <div className="space-y-8">
        <h3 className="mb-4 text-xl font-bold">Recent Uploads!</h3>
        {recentUploads ? (
          <AvatarList initialAvatars={recentUploads} title="Recent Uploads!" />
        ) : (
          <p className="text-sm text-red-500">Failed to load recent uploads.</p>
        )}
      </div> */}
    </div>
  )
}

export default CommunityStats
