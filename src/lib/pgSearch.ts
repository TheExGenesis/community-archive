import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { devLog } from '@/lib/devLog'
import { SearchParams, TweetMediaItem } from './types'
import { getMentionedUserAccount } from './mentionedUsers'

export const searchTweetsExact = async (
  supabase: SupabaseClient<Database>,
  queryText: string,
  account_id?: string,
) => {
  const words = queryText.split(' ')
  const queryExact = words.join('+')
  return pgSearch(supabase, queryExact, account_id)
}

export const searchTweetsAND = async (
  supabase: SupabaseClient<Database>,
  queryText: string,
  account_id?: string,
) => {
  const words = queryText
    .split(' ')
    .map((word) => `'${word.replaceAll(/'/g, "''")}'`)
  const queryAND = words.join(' & ')
  return pgSearch(supabase, queryAND, account_id)
}

export const searchTweetsOR = async (
  supabase: SupabaseClient<Database>,
  queryText: string,
  account_id?: string,
) => {
  const words = queryText
    .split(' ')
    .map((word) => `'${word.replaceAll(/'/g, "''")}'`)
  const queryOR = words.join(' | ')
  return pgSearch(supabase, queryOR, account_id)
}

const pgSearch = async (
  supabase: SupabaseClient<Database>,
  query: string,
  account_id?: string,
) => {

  const supabaseBaseQuery = supabase
    .from('tweets')
    .select(
      `
      tweet_id,
      account_id,
      created_at,
      full_text,
      retweet_count,
      favorite_count,
      reply_to_tweet_id,
      account:account!inner (
        profile (
          avatar_media_url,
          archive_upload_id
        ),
        username,
        account_display_name
      ),
      user_mentions (
        mentioned_user:mentioned_users (
          user_id,
          name,
          screen_name
        )
      )
    `,
    )
    .textSearch('fts', query)
    .order('created_at', { ascending: false })
    .limit(50)

  if (account_id) {
    supabaseBaseQuery.eq('account_id', account_id)
  }

  const { data: tweets, error } = await supabaseBaseQuery
  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }
  devLog('base search tweets', tweets)

  // Enrich tweets individually using the same logic as getTweet() for consistency

  // Return raw tweet data with enriched mentioned_users (exactly like getTweet() does)
  const enrichedTweets = await Promise.all(tweets.map(async (tweet: any) => {
    // First, rename user_mentions to mentioned_users for compatibility
    const tweetWithMentions = {
      ...tweet,
      mentioned_users: tweet.user_mentions || [],
      user_mentions: undefined
    }

    // Then enrich with account data for mentioned users (same as getTweet())
    if (tweetWithMentions.mentioned_users && tweetWithMentions.mentioned_users.length > 0) {
      const enrichedMentionedUsers = await Promise.all(
        tweetWithMentions.mentioned_users.map(async (userRecord: any) => {
          const accountData = await getMentionedUserAccount(supabase, userRecord.mentioned_user.screen_name)
          return {
            ...userRecord,
            mentioned_user: {
              ...userRecord.mentioned_user,
              account: accountData.data
            }
          }
        })
      )
      tweetWithMentions.mentioned_users = enrichedMentionedUsers
    }

    return tweetWithMentions
  }))

  devLog('search tweets', enrichedTweets)
  return enrichedTweets
}

export const parseSearchOptions = (query: string) => {
  // detect instances of from:{username}, to:{username}, since:{date}, until:{date} and put the following strings in an object
  let searchOptions: SearchParams = {
    search_query: query,
    from_user: null,
    to_user: null,
    since_date: null,
    until_date: null,
  }
  const words = query.split(' ')
  words.forEach((word) => {
    if (word.startsWith('from:')) {
      searchOptions.from_user = word.slice(5)
    }
    if (word.startsWith('to:')) {
      searchOptions.to_user = word.slice(3)
    }
    if (word.startsWith('since:')) {
      searchOptions.since_date = word.slice(5)
    }
    if (word.startsWith('until:')) {
      searchOptions.until_date = word.slice(5)
    }
  })
  const queryMinusOptions = words.filter(
    (word) =>
      !word.startsWith('from:') &&
      !word.startsWith('to:') &&
      !word.startsWith('since:') &&
      !word.startsWith('until:'),
  )
  searchOptions.search_query = queryMinusOptions.join(' ')
  return searchOptions
}

export interface SearchTweetRpcResponseItem {
  tweet_id: string;
  account_id: string;
  created_at: string;
  full_text: string;
  retweet_count: number;
  favorite_count: number;
  reply_to_tweet_id: string | null;
  avatar_media_url: string | null;
  archive_upload_id: number;
  username: string;
  account_display_name: string;
  media: TweetMediaItem[] | null;
}

export async function searchTweets(
  supabase: SupabaseClient<Database>,
  searchParams: SearchParams,
  limit: number = 50,
  offset: number = 0
): Promise<SearchTweetRpcResponseItem[] | null> {
  const params = {
    search_query: searchParams.search_query,
    from_user: searchParams.from_user || undefined,
    to_user: searchParams.to_user || undefined,
    since_date: searchParams.since_date || undefined,
    until_date: searchParams.until_date || undefined,
    limit_: limit,
    offset_: offset
  };

  const { data, error } = await supabase.rpc('search_tweets', params);

  if (error) {
    console.error('Error calling search_tweets RPC:', error);
    throw error;
  }

  if (!data) {
    return [];
  }

  return data as SearchTweetRpcResponseItem[];
}
