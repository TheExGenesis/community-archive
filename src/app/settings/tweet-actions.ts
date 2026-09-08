'use server'

import { requireAuth } from '@/lib/auth-utils'

export async function getOwnLatestTweets() {
  const { user, supabase } = await requireAuth('/settings')
  const accountId = user.app_metadata?.provider_id
  if (typeof accountId !== 'string' || !/^\d{1,20}$/.test(accountId)) {
    throw new Error('Your X account could not be verified')
  }
  const { data, error } = await supabase
    .from('tweets')
    .select('tweet_id, created_at, full_text, favorite_count, retweet_count')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error('Your tweets could not be loaded. Please retry.')
  return data ?? []
}
