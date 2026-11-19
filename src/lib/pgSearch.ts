import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { SearchParams, TweetMediaItem } from './types'

export interface SearchTweetRpcResponseItem {
  tweet_id: string;
  account_id: string;
  created_at: string;
  full_text: string;
  retweet_count: number | null;
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
  offset: number = 0,
  signal?: AbortSignal
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

  const query = supabase.rpc('search_tweets', params);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  signal?.throwIfAborted();

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
  offset: number = 0,
  signal?: AbortSignal
): Promise<SearchTweetRpcResponseItem[] | null> {
  const query = supabase.rpc('search_tweets_exact_phrase', {
    exact_phrase: params.exact_phrase,
    from_user: params.from_user || undefined,
    to_user: params.to_user || undefined,
    since_date: params.since_date || undefined,
    until_date: params.until_date || undefined,
    limit_: limit,
    offset_: offset,
  });
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  signal?.throwIfAborted();

  if (error) {
    console.error('Error calling search_tweets_exact_phrase RPC:', error);
    throw error;
  }

  return (data as SearchTweetRpcResponseItem[]) || [];
}
