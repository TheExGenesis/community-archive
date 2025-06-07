import { formatNumber } from '@/lib/formatNumber'

const calculateGoal = (accountCount: number): number => {
  const goals = [25, 50, 100, 250, 500, 750, 1000]
  if (accountCount < 25) return 25
  return goals.find((goal) => goal > accountCount) || goals[goals.length - 1]
}

interface CommunityStatsProps {
  accountCount: number | null
  tweetCount: number | null
  likedTweetCount: number | null
  showGoal?: boolean
}

const CommunityStats = ({ 
  accountCount,
  tweetCount,
  likedTweetCount,
  showGoal = false
}: CommunityStatsProps) => {

  if (accountCount === null || tweetCount === null || likedTweetCount === null) {
    return <p className="text-lg sm:text-xl text-center text-gray-700 dark:text-gray-300">Community statistics are currently unavailable.</p>
  }

  const goal = calculateGoal(accountCount || 0)

  return (
    <p className="text-xl text-gray-800 dark:text-gray-200">
      We have <strong>{formatNumber(tweetCount)}</strong> tweets and{' '}
      <strong>{formatNumber(likedTweetCount)}</strong> liked tweets from{' '}
      <strong>{formatNumber(accountCount)}</strong> accounts.
      {showGoal && goal && (
        <span className="italic ml-1">
          Next milestone: <strong>{formatNumber(goal)}</strong> accounts.
        </span>
      )}
    </p>
  )
}

export default CommunityStats
