import React, { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'

const getStats = async (supabase: any) => {
  const { data: accounts, error: accountsError } = await supabase
    .schema(getSchemaName())
    .from(getTableName('account'))
    .select(`username`)
    .order('created_at', { ascending: false })

  const { count: tweetCount, error: tweetsError } = await supabase
    .schema(getSchemaName())
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
        Accounts in the archive: {stats.usernames.join(', ')}
      </p>
    </div>
  )
}

export default CommunityStats
