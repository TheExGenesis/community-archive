import { SupabaseClient } from '@supabase/supabase-js';
import { TimelineTweet, RawSupabaseTweet, RawSupabaseAccount, RawSupabaseProfile } from '@/lib/types';
import { searchTweets as rpcSearchTweets } from '../pgSearch'; // Renamed to avoid conflict
import { type SearchParams } from '../types'; // Corrected import for SearchParams

export interface FilterCriteria {
  userId?: string; // For fetching tweets by a specific user
  searchQuery?: string; // For text search in tweets (tsquery-formatted)
  rawSearchQuery?: string; // Original unformatted search text (for two-query exact-match-first logic)
  mentionedUser?: string; // For tweets mentioning a specific user
  fromUsername?: string; // For tweets from a specific username
  replyToUsername?: string; // For tweets in reply to a specific username
  isRootTweet?: boolean; // To fetch only root-level tweets (no replies)
  hashtags?: string[]; // For tweets containing specific hashtags
  startDate?: string; // For tweets created after this date
  endDate?: string; // For tweets created before this date
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

/**
 * Build phrase (exact adjacency) and AND tsquery strings from raw search text.
 * For single-word queries both are identical so the caller can skip the second query.
 */
export function buildTsQueries(raw: string): { phrase: string; and: string; isMultiWord: boolean } {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return { phrase: words[0] || '', and: words[0] || '', isMultiWord: false };
  }
  return {
    phrase: words.join(' <-> '),
    and: words.join(' & '),
    isMultiWord: true,
  };
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
    const baseParams = {
      from_user: criteria.fromUsername || null,
      to_user: criteria.replyToUsername || null,
      since_date: criteria.startDate || null,
      until_date: criteria.endDate || null,
    };

    try {
      const offset = (page - 1) * pageSize;
      const rawText = criteria.rawSearchQuery;

      // Two-query exact-match-first logic:
      // If we have raw multi-word search text, do phrase search first, then fill
      // remaining slots with AND search (excluding duplicates).
      if (rawText && rawText.trim().split(/\s+/).length > 1) {
        const { phrase, and } = buildTsQueries(rawText);

        // Query 1: phrase (exact adjacency) matches
        const phraseData = await rpcSearchTweets(
          supabase,
          { ...baseParams, search_query: phrase },
          pageSize,
          offset,
        );
        const phraseResults = phraseData || [];

        if (phraseResults.length >= pageSize) {
          // Page is full with exact matches — no need for a second query
          return {
            tweets: transformRawTweetsToTimelineTweets(phraseResults, true),
            totalCount: null,
            error: null,
          };
        }

        // Query 2: AND matches to fill the rest, excluding phrase result IDs
        const phraseIds = new Set(phraseResults.map((t) => t.tweet_id));
        const remaining = pageSize - phraseResults.length;
        // Fetch a bit extra so we can filter out duplicates and still fill the page
        const andData = await rpcSearchTweets(
          supabase,
          { ...baseParams, search_query: and },
          remaining + phraseIds.size,
          offset,
        );
        const andResults = (andData || []).filter((t) => !phraseIds.has(t.tweet_id)).slice(0, remaining);

        const combined = [...phraseResults, ...andResults];
        return {
          tweets: transformRawTweetsToTimelineTweets(combined, true),
          totalCount: null,
          error: null,
        };
      }

      // Single-word or pre-formatted query — single query path
      const searchParams: SearchParams = {
        search_query: criteria.searchQuery || '',
        ...baseParams,
      };
      const rpcData = await rpcSearchTweets(supabase, searchParams, pageSize, offset);

      if (!rpcData || rpcData.length === 0) {
        return { tweets: [], totalCount: rpcData?.length === 0 ? 0 : null, error: null };
      }
      return { tweets: transformRawTweetsToTimelineTweets(rpcData, true), totalCount: null, error: null };
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
          height
        )
      `,
        { count: 'estimated' }
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