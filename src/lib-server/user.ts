import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { getSchemaName } from '@/lib-client/getTableName'

const tweetSelectString = `
        *,
        ${'account'}!inner (
          profile (
            avatar_media_url
          ),
          username,
          account_display_name
        )
      `

export const getFirstTweets = async(account_id:string, limit:number= 100) => {
  const supabase = createServerClient(cookies())
  const { data } = await 
    supabase
      .schema(getSchemaName())
      .from('tweets')
      .select(tweetSelectString)
      .eq('account_id', account_id)
      .order('created_at', { ascending: true })
      .limit(limit)
  return data
}

export const getTopTweets = async(account_id:string, limit:number= 20) => {
  const supabase = createServerClient(cookies())
  const { data } = await 
    supabase
      .schema(getSchemaName())
      .from('tweets')
      .select(tweetSelectString)
      .eq('account_id', account_id)
      .order('retweet_count', { ascending: false })
      .order('favorite_count', { ascending: false })
      .limit(limit)
  return data
}

export const getUserData = async (account_id:string) => {
  const supabase = createServerClient(cookies())
  const { data } = await 
    supabase
      .schema(getSchemaName())
      .from('account')
      .select('*')
      .eq('account_id', account_id)

  if (!data || data.length == 0) {
    return null
  }


    const { count } = await supabase
      .schema(getSchemaName())
      .from('tweets')
      .select('tweet_id', { count: 'planned', head: true })
      .eq('account_id', account_id)

    return {
        account: data[0],
        tweetCount: count
    }
}
