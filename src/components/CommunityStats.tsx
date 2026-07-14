import React from 'react'
import { formatNumber } from '@/lib/formatNumber'

const calculateGoal = (userCount: number): number => {
  const goals = [25, 50, 100, 250, 500, 750, 1000]
  if (userCount < 25) return 25
  return goals.find((goal) => goal > userCount) || goals[goals.length - 1]
}

interface CommunityStatsProps {
  userCount: number | null
  tweetCount: number | null
  showGoal?: boolean
}

const CommunityStats = ({
  userCount,
  tweetCount,
  showGoal = false,
}: CommunityStatsProps) => {
  if (userCount === null || tweetCount === null) {
    return (
      <p className="text-center text-lg text-gray-700 dark:text-gray-300 sm:text-xl">
        Community statistics are currently unavailable.
      </p>
    )
  }

  const goal = calculateGoal(userCount || 0)

  return (
    <p className="text-xl text-gray-800 dark:text-gray-200">
      We have <strong>{formatNumber(tweetCount)}</strong> tweets from{' '}
      <strong>{formatNumber(userCount)}</strong> users.
      {showGoal && goal && (
        <span className="ml-1 italic">
          Next milestone: <strong>{formatNumber(goal)}</strong> accounts.
        </span>
      )}
    </p>
  )
}

export default CommunityStats
