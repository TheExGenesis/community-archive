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
  // Use RPC if a text search query is provided OR if any filters supported by the RPC are used.
  if (
    criteria.searchQuery || // Main keyword search
    criteria.fromUsername || // Filter by author username
    criteria.replyToUsername || // Filter by replied-to username
    criteria.startDate || // Filter by start date
    criteria.endDate // Filter by end date
  ) {
    const searchParams: SearchParams = {
      search_query: criteria.searchQuery || '', // Pass empty string if not provided
      from_user: criteria.fromUsername || null,
      to_user: criteria.replyToUsername || null,
      since_date: criteria.startDate || null,
      until_date: criteria.endDate || null,
    };

    try {
      const offset = (page - 1) * pageSize;
      // Assuming rpcSearchTweets is an alias for the searchTweets function from pgSearch.ts
      const rpcData = await rpcSearchTweets(supabase, searchParams, pageSize, offset);
      
      if (!rpcData || rpcData.length === 0) {
        return { tweets: [], totalCount: rpcData?.length === 0 ? 0 : null, error: null };
      }
      // The RPC result now includes 'total_count' if the SQL function is modified to return it.
      // For now, totalCount from RPC is an estimate or based on limited results.
      // The SQL function `search_tweets` currently doesn't return a total count for pagination.
      // We might need to adjust this or the SQL if accurate pagination for RPC results is critical.
      const transformedTweets = transformRawTweetsToTimelineTweets(rpcData, true);
      // If rpcData has a total_count field from a modified SQL function:
      // const totalCountFromRpc = rpcData[0]?.total_count_estimate || null; 
      // For now, we don't get a separate total count from the current search_tweets RPC for pagination.
      // It just returns a limited set.
      return { tweets: transformedTweets, totalCount: null, error: null }; 
    } catch (error: any) {
      console.error('Error fetching tweets via RPC:', error);
      if (error.message && error.message.includes('statement timeout')) {
         return { tweets: [], totalCount: 0, error: { message: 'Search query timed out. Please try a more specific search.', details: error } };
      }
      return { tweets: [], totalCount: 0, error };
    }
  } else {
    // Fallback to direct Supabase query for filters not supported by the main search_tweets RPC
    // (e.g., specific userId, isRootTweet, mentionedUser, hashtags without other search terms)
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
          height,
          alt_text
        )
      `,
        { count: 'exact' }
      );

    if (criteria.userId) {
      query = query.eq('account_id', criteria.userId);
    }

    // Note: fromUsername is handled by RPC path. If it reaches here, it means no other RPC criteria were met.
    // However, if we wanted to support fromUsername directly here (e.g. if RPC path was removed),
    // it would need to be: query = query.eq('all_account.username', criteria.fromUsername);
    // Same for replyToUsername: query = query.eq('reply_to_username', criteria.replyToUsername);
    
    if (criteria.mentionedUser) {
      // Ensure 'all_account' is the correct alias if filtering on joined table.
      // Here, mentionedUser is likely in 'full_text' of the 'tweets' table.
      query = query.ilike('full_text', `%@${criteria.mentionedUser}%`);
    }

    if (criteria.isRootTweet) {
      query = query.is('reply_to_tweet_id', null);
    }

    if (criteria.hashtags && criteria.hashtags.length > 0) {
      criteria.hashtags.forEach(tag => {
        query = query.ilike('full_text', `%#${tag}%`);
      });
    }

    // Date filters are handled by RPC path if present.
    // If they were to be handled here, they would be:
    // if (criteria.startDate) {
    //   query = query.gte('created_at', criteria.startDate);
    // }
    // if (criteria.endDate) {
    //   query = query.lte('created_at', criteria.endDate);
    // }
    
    query = query.order('created_at', { ascending: false });
    query = query.range((page - 1) * pageSize, page * pageSize - 1);

    const { data: rawData, error, count } = await query;

    if (error) {
      console.error('Error fetching tweets directly:', error); // Clarified error source
      if (error.message && error.message.includes('statement timeout')) {
        return { tweets: [], totalCount: 0, error: { message: 'Query timed out. Please try a more specific query.', details: error } };
      }
      return { tweets: [], totalCount: 0, error };
    }
    if (!rawData) {
      return { tweets: [], totalCount: 0, error: null };
    }
    
    const transformedTweets = transformRawTweetsToTimelineTweets(rawData, false);
    return { tweets: transformedTweets, totalCount: count, error: null };
  }
} 