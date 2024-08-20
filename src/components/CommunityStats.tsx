import React, { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib-client/getTableName'

const getStats = async (supabase: any) => {
  const { data: accounts, error: accountsError } = await supabase
    .from(getTableName('account'))
    .select(`username`)
    .order('created_at', { ascending: false })

  const { count: tweetCount, error: tweetsError } = await supabase
    .from(getTableName('tweets'))
    .select('id', { count: 'exact', head: true })

  if (accountsError || tweetsError) {
    console.error('Error fetching stats:', accountsError || tweetsError)
    throw accountsError || tweetsError
  }

  return {
    usernames: accounts.map((account: any) => account.username),
    accountCount: accounts.length,
    tweetCount,
  }
}

const CommunityStats = () => {
  const [stats, setStats] = useState({
    usernames: [],
    accountCount: 0,
    tweetCount: 0,
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
      <p className="mb-4 text-sm">
        <strong>{stats.accountCount}</strong> accounts have uploaded a total of{' '}
        <strong>{stats.tweetCount}</strong> tweets.
      </p>
      <p className="mb-4 text-sm">
        These wonderful people have already uploaded their archives:
      </p>
      <div className="mb-8 max-h-40 overflow-y-auto">
        {stats.usernames.map((username) => (
          <div key={username} className="mb-2">
            {username}
          </div>
        ))}
      </div>
    </div>
  )
}

export default CommunityStats
