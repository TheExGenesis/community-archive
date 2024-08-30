import React, { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'

const getStats = async (supabase: any) => {
  const [accountsResult, tweetsResult, likedTweetsResult] = await Promise.all([
    supabase
      .schema(getSchemaName())
      .from(getTableName('account'))
      .select(`username`)
      .order('created_at', { ascending: false }),

    supabase
      .schema(getSchemaName())
      .from(getTableName('tweets'))
      .select('tweet_id', { count: 'exact', head: true }),

    supabase
      .schema(getSchemaName())
      .from(getTableName('liked_tweets'))
      .select('tweet_id', { count: 'exact', head: true }),
  ])

  const { data: accounts, error: accountsError } = accountsResult
  const { count: tweetCount, error: tweetsError } = tweetsResult
  const { count: likedTweetCount, error: likedTweetsError } = likedTweetsResult

  if (accountsError || tweetsError || likedTweetsError) {
    console.error(
      'Error fetching stats:',
      accountsError || tweetsError || likedTweetsError,
    )
    throw accountsError || tweetsError || likedTweetsError
  }

  return {
    usernames: accounts.map((account: any) => account.username),
    accountCount: accounts.length,
    tweetCount,
    likedTweetCount,
  }
}

const CommunityStats = () => {
  const [stats, setStats] = useState({
    usernames: [],
    accountCount: null,
    tweetCount: null,
    likedTweetCount: null,
  })

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createBrowserClient()
      const fetchedStats = await getStats(supabase)
      setStats(fetchedStats)
    }

    fetchStats()
  }, [])

  return (
    <div>
      {stats.accountCount !== null && stats.tweetCount !== null && (
        <>
          <p className="mb-4 text-sm">
            <strong>{stats.accountCount}</strong> accounts have uploaded a total
            of <strong>{stats.tweetCount}</strong> tweets. We also have{' '}
            <strong>{stats.likedTweetCount}</strong> liked tweets.
          </p>
        </>
      )}
      {stats.usernames.length > 0 && (
        <p className="mb-4 text-sm">
          Accounts in the archive: {stats.usernames.join(', ')}
        </p>
      )}
    </div>
  )
}

export default CommunityStats
