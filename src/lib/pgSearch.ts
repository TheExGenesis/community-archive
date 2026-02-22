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
      account:all_account!inner (
        username,
        account_display_name,
        profile:all_profile (
          avatar_media_url,
          archive_upload_id
        )
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
    const profileEntry = Array.isArray(tweet.account?.profile)
      ? tweet.account.profile.reduce((latest: any, current: any) => {
          if (!latest) return current
          const latestId = Number(latest.archive_upload_id ?? 0)
          const currentId = Number(current.archive_upload_id ?? 0)
          return currentId >= latestId ? current : latest
        }, null as any)
      : tweet.account?.profile

    // First, rename user_mentions to mentioned_users for compatibility
    const tweetWithMentions = {
      ...tweet,
      avatar_media_url: tweet.avatar_media_url || profileEntry?.avatar_media_url,
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
  // Some deployments return a minimal shape; make enrichments optional
  reply_to_tweet_id?: string | null;
  avatar_media_url?: string | null;
  archive_upload_id?: number | null;
  username?: string | null;
  account_display_name?: string | null;
  media?: TweetMediaItem[] | null;
  // Ranking score on some search implementations
  relevance?: number;
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

  // Aligns with generated types that may return a minimal shape; enriched fields are optional
  return data as SearchTweetRpcResponseItem[];
}

export interface ExactPhraseParams {
  exact_phrase: string;
  from_user: string | null;
  to_user: string | null;
  since_date: string | null;
  until_date: string | null;
}

export async function searchTweetsExactPhrase(
  supabase: SupabaseClient,
  params: ExactPhraseParams,
  limit: number = 50,
  offset: number = 0
): Promise<SearchTweetRpcResponseItem[] | null> {
  const { data, error } = await supabase.rpc('search_tweets_exact_phrase', {
    exact_phrase: params.exact_phrase,
    from_user: params.from_user || undefined,
    to_user: params.to_user || undefined,
    since_date: params.since_date || undefined,
    until_date: params.until_date || undefined,
    limit_: limit,
    offset_: offset,
  });

  if (error) {
    console.error('Error calling search_tweets_exact_phrase RPC:', error);
    throw error;
  }

  return (data as SearchTweetRpcResponseItem[]) || [];
}
