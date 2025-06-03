import { SupabaseClient } from '@supabase/supabase-js';
import { TimelineTweet, RawSupabaseTweet, RawSupabaseAccount, RawSupabaseProfile } from '@/lib/types';
import { searchTweets as rpcSearchTweets } from '../pgSearch'; // Renamed to avoid conflict
import { type SearchParams } from '../types'; // Corrected import for SearchParams

export interface FilterCriteria {
  userId?: string; // For fetching tweets by a specific user
  searchQuery?: string; // For text search in tweets
  mentionedUser?: string; // For tweets mentioning a specific user
  fromUsername?: string; // For tweets from a specific username
  replyToUsername?: string; // For tweets in reply to a specific username
  isRootTweet?: boolean; // To fetch only root-level tweets (no replies)
  hashtags?: string[]; // For tweets containing specific hashtags
  startDate?: string; // For tweets created after this date
  endDate?: string; // For tweets created before this date
  // Add other potential criteria as needed, e.g., minLikes, minRetweets
}

const DEFAULT_PAGE_SIZE = 50;

// Helper to transform data from either source
function transformRawTweetsToTimelineTweets(rawData: any[], isRpcResult: boolean = false): TimelineTweet[] {
  return (rawData as any[]).map(rawTweet => {
    let timelineAccount: TimelineTweet['account'] = {
      username: "unknown_user",
      account_display_name: "Unknown User",
      profile: undefined,
    };

    if (isRpcResult) {
      // RPC result likely has flat account data on rawTweet itself
      if (rawTweet.username) {
        timelineAccount = {
          username: rawTweet.username,
          account_display_name: rawTweet.account_display_name || rawTweet.username,
          profile: rawTweet.avatar_media_url
            ? { avatar_media_url: rawTweet.avatar_media_url === null ? undefined : rawTweet.avatar_media_url }
            : undefined,
        };
      } else {
        console.error(`RPC Tweet ${rawTweet.tweet_id} is missing account username. Using fallback.`);
      }
    } else {
      // Direct query result has nested account data
      const accountData = rawTweet.account as RawSupabaseAccount | undefined;
      if (accountData && accountData.username) {
        const profileData = accountData.profile as RawSupabaseProfile | null | undefined;
        timelineAccount = {
          username: accountData.username,
          account_display_name: accountData.account_display_name,
          profile: profileData?.avatar_media_url
            ? { avatar_media_url: profileData.avatar_media_url === null ? undefined : profileData.avatar_media_url }
            : undefined,
        };
      } else {
        console.error(`Direct Query Tweet ${rawTweet.tweet_id} is missing account data. Using fallback.`);
      }
    }
    
    return {
      tweet_id: rawTweet.tweet_id,
      created_at: rawTweet.created_at,
      full_text: rawTweet.full_text,
      favorite_count: rawTweet.favorite_count,
      retweet_count: rawTweet.retweet_count,
      reply_to_tweet_id: rawTweet.reply_to_tweet_id,
      account: timelineAccount,
      media: rawTweet.media || [], 
    } as TimelineTweet;
  });
}

export async function fetchTweets(
  supabase: SupabaseClient,
  criteria: FilterCriteria,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<{ tweets: TimelineTweet[]; totalCount: number | null; error: any }> {
  if (criteria.searchQuery) {
    const searchParams: SearchParams = {
      search_query: criteria.searchQuery,
      from_user: criteria.fromUsername || null,
      to_user: criteria.replyToUsername || null, 
      since_date: criteria.startDate || null,
      until_date: criteria.endDate || null,
    };

    try {
      const rpcData = await rpcSearchTweets(supabase, searchParams, pageSize);
      if (!rpcData) {
        return { tweets: [], totalCount: 0, error: null };
      }
      const transformedTweets = transformRawTweetsToTimelineTweets(rpcData, true); // Mark as RPC result
      return { tweets: transformedTweets, totalCount: transformedTweets.length, error: null };
    } catch (error: any) {
      console.error('Error fetching tweets via RPC:', error);
      if (error.message && error.message.includes('statement timeout')) {
         return { tweets: [], totalCount: 0, error: { message: 'Search query timed out. Please try a more specific search.', details: error } };
      }
      return { tweets: [], totalCount: 0, error };
    }
  } else {
    let query = supabase
      .from('tweets')
      .select(
        `
        tweet_id,
        created_at,
        full_text,
        favorite_count,
        retweet_count,
        reply_to_tweet_id,
        reply_to_username,
        account:all_account!inner (
          username,
          account_display_name,
          profile:profile!left (
            avatar_media_url
          )
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        )
      `,
        { count: 'exact' }
      );

    if (criteria.userId) {
      query = query.eq('account_id', criteria.userId);
    }

    if (criteria.fromUsername) {
      query = query.eq('account.username', criteria.fromUsername);
    }
    
    if (criteria.mentionedUser) {
      query = query.ilike('full_text', `%@${criteria.mentionedUser}%`); // Corrected string literal
    }

    if (criteria.replyToUsername) {
      query = query.eq('reply_to_username', criteria.replyToUsername);
    }

    if (criteria.isRootTweet) {
      query = query.is('reply_to_tweet_id', null);
    }

    if (criteria.hashtags && criteria.hashtags.length > 0) {
      criteria.hashtags.forEach(tag => {
        query = query.ilike('full_text', `%#${tag}%`); // Corrected string literal
      });
    }

    if (criteria.startDate) {
      query = query.gte('created_at', criteria.startDate);
    }

    if (criteria.endDate) {
      query = query.lte('created_at', criteria.endDate);
    }
    
    query = query.order('created_at', { ascending: false });
    query = query.range((page - 1) * pageSize, page * pageSize - 1);

    const { data: rawData, error, count } = await query;

    if (error) {
      console.error('Error fetching tweets:', error);
      if (error.message && error.message.includes('statement timeout')) {
        return { tweets: [], totalCount: 0, error: { message: 'Query timed out. Please try a more specific query.', details: error } };
      }
      return { tweets: [], totalCount: 0, error };
    }
    if (!rawData) {
      return { tweets: [], totalCount: 0, error: null };
    }
    
    const transformedTweets = transformRawTweetsToTimelineTweets(rawData, false); // Mark as non-RPC result
    return { tweets: transformedTweets, totalCount: count, error: null };
  }
} 