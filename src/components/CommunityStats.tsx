import { getStats } from '@/lib-server/stats'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

const CommunityStats = async () => {
  const supabase = createServerClient(cookies())
  const stats = await getStats(supabase).catch((error) => {
    console.error('Failed to fetch stats:', error)
    return {
      accountCount: null,
      tweetCount: null,
      likedTweetCount: null,
      usernames: null,
    }
  })

  return (
    <div className="text-sm dark:text-gray-300">
      {stats.accountCount !== null &&
        stats.tweetCount !== null &&
        stats.likedTweetCount !== null && (
          <p className="mb-4 text-xs">
            <strong>{stats.accountCount}</strong> accounts have uploaded a total
            of <strong>{stats.tweetCount}</strong> tweets. We also have{' '}
            <strong>{stats.likedTweetCount}</strong> liked tweets.
          </p>
        )}
    </div>
  )
}

export default CommunityStats
