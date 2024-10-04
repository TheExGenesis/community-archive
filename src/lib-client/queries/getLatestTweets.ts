import { createBrowserClient } from '@/utils/supabase'

const getLatestTweets = async (
  supabase: any,
  count: number,
  account_id?: string,
) => {
  const newSupabaseClient = createBrowserClient()

  const { data, error } = await newSupabaseClient.rpc('get_latest_tweets', {
    count: count,
    p_account_id: account_id,
  })

  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  console.log('getLatestTweets', data)

  return data
}

export default getLatestTweets
