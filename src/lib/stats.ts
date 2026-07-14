import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js'

export const getStats = async (supabase: SupabaseClient) => {
  const publicSchema = supabase.schema('public')
  const [summaryResult, optInResult] = await Promise.all([
    publicSchema
      .from('global_activity_summary')
      .select('total_accounts, total_tweets, total_user_mentions')
      .single(),
    publicSchema
      .from('optin')
      .select('*', { count: 'exact', head: true })
      .eq('opted_in', true),
  ])

  if (summaryResult.error) {
    console.error('Error fetching global activity summary:', summaryResult.error)
    throw summaryResult.error
  }

  if (optInResult.error) {
    console.error('Error fetching opted-in user count:', optInResult.error)
    throw optInResult.error
  }

  return {
    accountCount: summaryResult.data.total_accounts,
    optInCount: optInResult.count,
    tweetCount: summaryResult.data.total_tweets,
    userMentionsCount: summaryResult.data.total_user_mentions,
  }
}
