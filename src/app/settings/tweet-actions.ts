'use server'

import { requireAuth } from '@/lib/auth-utils'
import {
  OWN_TWEETS_PAGE_SIZE,
  normalizeOwnTweetSearch,
  type OwnTweetSearch,
} from '@/lib/ownTweetSearch'

export async function searchOwnTweets(search: OwnTweetSearch = {}) {
  const { user, supabase } = await requireAuth('/settings')
  const accountId = user.app_metadata?.provider_id
  if (typeof accountId !== 'string' || !/^\d{1,20}$/.test(accountId)) {
    throw new Error('Your X account could not be verified')
  }
  // Server actions take untrusted input; clamp everything before querying.
  const { query, kind, olderThanYears, sort, offset } =
    normalizeOwnTweetSearch(search)

  let request = supabase
    .from('tweets')
    .select('tweet_id, created_at, full_text, favorite_count, retweet_count')
    .eq('account_id', accountId)
    .eq('is_tombstone', false)
  if (query) {
    request = request.textSearch('fts', query, {
      type: 'websearch',
      config: 'english',
    })
  }
  if (kind === 'original') request = request.is('reply_to_tweet_id', null)
  if (kind === 'replies') request = request.not('reply_to_tweet_id', 'is', null)
  if (olderThanYears > 0) {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - olderThanYears)
    request = request.lt('created_at', cutoff.toISOString())
  }
  if (sort === 'least_liked' || sort === 'most_liked') {
    request = request.order('favorite_count', {
      ascending: sort === 'least_liked',
    })
  }
  // One extra row tells the client whether another page exists.
  const { data, error } = await request
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + OWN_TWEETS_PAGE_SIZE)
  if (error) throw new Error('Your tweets could not be loaded. Please retry.')
  const rows = data ?? []
  return {
    tweets: rows.slice(0, OWN_TWEETS_PAGE_SIZE),
    hasMore: rows.length > OWN_TWEETS_PAGE_SIZE,
  }
}
