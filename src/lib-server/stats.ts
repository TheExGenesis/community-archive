import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { getSchemaName } from '@/lib-client/getTableName'

export const getStats = async () => {
  const supabase = createServerClient(cookies())
  const [accountsResult, tweetsResult, likedTweetsResult] = await Promise.all([
    supabase
      .schema(getSchemaName())
      .from('account')
      .select(`username,account_id`)
      .order('created_at', { ascending: false }),

    supabase
      .schema(getSchemaName())
      .from('tweets')
      .select('tweet_id', { count: 'planned', head: true }),

    supabase
      .schema(getSchemaName())
      .from('liked_tweets')
      .select('tweet_id', { count: 'planned', head: true }),
  ])

  const { data: accounts, error: accountsError } = accountsResult
  const { count: tweetCount, error: tweetsError } = tweetsResult
  const { count: likedTweetCount, error: likedTweetsError } = likedTweetsResult

  if (accountsError) {
    console.error('Error fetching accounts:', accountsError)
  }
  if (tweetsError) {
    console.error('Error fetching tweets:', tweetsError)
  }
  if (likedTweetsError) {
    console.error('Error fetching liked tweets:', likedTweetsError)
  }

  return {
    users: accounts,
    accountCount: accounts ? accounts.length : null,
    tweetCount: tweetCount ?? null,
    likedTweetCount: likedTweetCount ?? null,
  }
}
