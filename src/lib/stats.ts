import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js'

export const getStats = async (supabase: SupabaseClient) => {
  const publicSchema = supabase.schema('public')
  const [summaryResult, memberResult] = await Promise.all([
    publicSchema
      .from('global_activity_summary')
      .select('total_tweets, total_user_mentions')
      .single(),
    publicSchema
      .from('user_directory')
      .select('directory_id', { count: 'exact', head: true }),
  ])

  if (summaryResult.error) {
    console.error(
      'Error fetching global activity summary:',
      summaryResult.error,
    )
    throw summaryResult.error
  }

  if (memberResult.error) {
    console.error(
      'Error fetching participating user count:',
      memberResult.error,
    )
    throw memberResult.error
  }

  return {
    userCount: memberResult.count,
    tweetCount: summaryResult.data.total_tweets,
    userMentionsCount: summaryResult.data.total_user_mentions,
  }
}
