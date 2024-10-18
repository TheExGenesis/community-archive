import { getStats } from '@/lib-server/stats'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { formatNumber } from '@/lib-client/formatNumber'

const calculateGoal = (accountCount: number): number => {
  const goals = [25, 50, 100, 250, 500, 750, 1000]
  if (accountCount < 25) return 25
  return goals.find((goal) => goal > accountCount) || goals[goals.length - 1]
}

interface CommunityStatsProps {
  showGoal?: boolean
}
type Stats = {
  accountCount: number | null
  tweetCount: number | null
  likedTweetCount: number | null
  userMentionsCount: string[] | null
}
const CommunityStats = async ({ showGoal }: CommunityStatsProps) => {
  const supabase = createServerClient(cookies())
  const stats: Stats = await getStats(supabase).catch((error) => {
    console.error('Failed to fetch stats:', error)
    return {
      accountCount: null,
      tweetCount: null,
      likedTweetCount: null,
      userMentionsCount: null,
    }
  })
  const goal = calculateGoal(stats.accountCount || 0)

  return (
    <div className="text-sm dark:text-gray-300">
      {stats.accountCount !== null &&
        stats.tweetCount !== null &&
        stats.likedTweetCount !== null && (
          <p className="mb-4 text-xs">
            <strong>{formatNumber(stats.tweetCount)}</strong> tweets contributed
            from <strong>{formatNumber(stats.accountCount)}</strong> accounts.
            {showGoal && goal && (
              <span className="italic">
                {' '}
                Next milestone: <strong>{formatNumber(goal)}</strong> accounts.
              </span>
            )}
          </p>
        )}
    </div>
  )
}

export default CommunityStats
