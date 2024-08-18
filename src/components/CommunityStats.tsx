import React, { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib-client/getTableName'

const getUsernames = async (supabase: any) => {
  const { data: accounts, error } = await supabase
    .from(getTableName('account'))
    .select(`*`)
    .order('created_at', { ascending: false })
  console.log({ accounts })
  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  return accounts.map((account: any) => account.username)
}

const CommunityStats = () => {
  const [usernames, setUsernames] = useState([])

  useEffect(() => {
    const fetchUsernames = async () => {
      const supabase = createBrowserClient()
      const usernames = await getUsernames(supabase)
      setUsernames(usernames || [])
    }

    fetchUsernames()
  }, [])

  return (
    <div>
      <p className="mb-4 text-sm">
        These wonderful people have already uploaded their archives:
      </p>
      <div className="mb-8 max-h-40 overflow-y-auto">
        {usernames.map((username) => (
          <div key={username} className="mb-2">
            {username}
          </div>
        ))}
      </div>
    </div>
  )
}

export default CommunityStats
