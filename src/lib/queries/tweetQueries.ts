import { SupabaseClient } from '@supabase/supabase-js'
import {
  TimelineTweet,
  RawSupabaseTweet,
  RawSupabaseAccount,
  RawSupabaseProfile,
} from '@/lib/types'
import {
  searchTweets as rpcSearchTweets,
  searchTweetsExactPhrase as rpcSearchExactPhrase,
} from '../pgSearch'
import { type SearchParams } from '../types'
import { getLatestAvatarMediaUrl } from '@/lib/avatar'
import { searchTweetsWithClickHouse } from '../clickhouseSearch'
import { enrichSearchTweets } from '../searchTweetEnrichments'

export interface FilterCriteria {
  userId?: string // For fetching tweets by a specific user
  searchQuery?: string // For text search in tweets (tsquery-formatted)
  rawSearchQuery?: string // Original unformatted search text (for two-query exact-match-first logic)
  mentionedUser?: string // For tweets mentioning a specific user
  fromUsername?: string // For tweets from a specific username
  replyToUsername?: string // For tweets in reply to a specific username
  isRootTweet?: boolean // To fetch only root-level tweets (no replies)
  hashtags?: string[] // For tweets containing specific hashtags
  startDate?: string // For tweets created after this date
  endDate?: string // For tweets created before this date
  excludeRetweets?: boolean // Exclude native archive retweets that start with "RT @"
  includeQuoteTweets?: boolean // Batch-load quoted tweet bodies for rich rendering
  sort?: TweetSearchSort // Server-side order for ClickHouse text search
}

export type TweetSearchSort = 'newest' | 'oldest' | 'likes' | 'reposts'

const DEFAULT_PAGE_SIZE = 50
const CLICKHOUSE_FILTER_PAGE_SIZE = 50
const MAX_CLICKHOUSE_FILTER_PAGES = 10

export function isRetweetText(text: string): boolean {
  return /^RT @[A-Za-z0-9_]+/.test(text)
}

// Helper to transform data from either source
function transformRawTweetsToTimelineTweets(
  rawData: any[],
  isRpcResult: boolean = false,
): TimelineTweet[] {
  return (rawData as any[]).map((rawTweet) => {
    let timelineAccount: TimelineTweet['account'] = {
      username: 'unknown_user',
      account_display_name: 'Unknown User',
      profile: undefined,
    }

    if (isRpcResult) {
      // RPC result likely has flat account data on rawTweet itself
      if (rawTweet.username) {
        timelineAccount = {
          username: rawTweet.username,
          account_display_name:
            rawTweet.account_display_name || rawTweet.username,
          profile: rawTweet.avatar_media_url
            ? {
                avatar_media_url:
                  rawTweet.avatar_media_url === null
                    ? undefined
                    : rawTweet.avatar_media_url,
              }
            : undefined,
        }
      } else {
        console.error(
          `RPC Tweet ${rawTweet.tweet_id} is missing account username. Using fallback.`,
        )
      }
    } else {
      // Direct query result has nested account data
      const accountData = rawTweet.account as RawSupabaseAccount | undefined
      if (accountData && accountData.username) {
        const profileData = accountData.profile as
          | RawSupabaseProfile
          | RawSupabaseProfile[]
          | null
          | undefined
        const avatarMediaUrl = getLatestAvatarMediaUrl(profileData)
        timelineAccount = {
          username: accountData.username,
          account_display_name: accountData.account_display_name,
          profile: avatarMediaUrl
            ? { avatar_media_url: avatarMediaUrl }
            : undefined,
        }
      } else {
        console.error(
          `Direct Query Tweet ${rawTweet.tweet_id} is missing account data. Using fallback.`,
        )
      }
    }

    return {
      tweet_id: rawTweet.tweet_id,
      account_id: rawTweet.account_id,
      created_at: rawTweet.created_at,
      full_text: rawTweet.full_text,
      favorite_count: rawTweet.favorite_count,
      retweet_count: rawTweet.retweet_count,
      reply_to_tweet_id: rawTweet.reply_to_tweet_id,
      account: timelineAccount,
      media: rawTweet.media || [],
    } as TimelineTweet
  })
}

async function finalizeTweets(
  supabase: SupabaseClient,
  tweets: TimelineTweet[],
  criteria: FilterCriteria,
): Promise<TimelineTweet[]> {
  const filteredTweets = criteria.excludeRetweets
    ? tweets.filter((tweet) => !isRetweetText(tweet.full_text))
    : tweets

  return criteria.includeQuoteTweets
    ? enrichSearchTweets(supabase, filteredTweets)
    : filteredTweets
}

async function searchClickHousePage(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
): Promise<TimelineTweet[]> {
  if (!criteria.excludeRetweets) {
    return searchTweetsWithClickHouse(criteria, page, pageSize)
  }

  const pageStart = (page - 1) * pageSize
  const pageEnd = page * pageSize
  const nonRetweets: TimelineTweet[] = []

  // ClickHouse does not yet expose a retweet predicate, so scan bounded raw
  // pages from the start to keep filtered pagination deterministic and full.
  for (
    let rawPage = 1;
    rawPage <= MAX_CLICKHOUSE_FILTER_PAGES && nonRetweets.length < pageEnd;
    rawPage += 1
  ) {
    const chunk = await searchTweetsWithClickHouse(
      criteria,
      rawPage,
      CLICKHOUSE_FILTER_PAGE_SIZE,
    )
    nonRetweets.push(
      ...chunk.filter((tweet) => !isRetweetText(tweet.full_text)),
    )
    if (chunk.length < CLICKHOUSE_FILTER_PAGE_SIZE) break
  }

  return nonRetweets.slice(pageStart, pageEnd)
}

/**
 * Build AND tsquery string from raw search text.
 */
export function buildAndTsQuery(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  return words.join(' & ')
}

/**
 * Exact phrase search using FTS 'simple' config via RPC function.
 *
 * Uses phraseto_tsquery('simple', ...) which matches exact word order
 * without dropping stop words. Backed by a GIN index on
 * to_tsvector('simple', full_text) for fast lookups.
 */
async function searchExactPhrase(
  supabase: SupabaseClient,
  phrase: string,
  criteria: FilterCriteria,
  pageSize: number,
  offset: number,
): Promise<TimelineTweet[]> {
  const data = await rpcSearchExactPhrase(
    supabase,
    {
      exact_phrase: phrase,
      from_user: criteria.fromUsername || null,
      to_user: criteria.replyToUsername || null,
      since_date: criteria.startDate || null,
      until_date: criteria.endDate || null,
    },
    pageSize,
    offset,
  )

  return data ? transformRawTweetsToTimelineTweets(data, true) : []
}

export async function fetchTweets(
  supabase: SupabaseClient,
  criteria: FilterCriteria,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
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
    }

    try {
      const offset = (page - 1) * pageSize
      const rawText = criteria.rawSearchQuery
      const clickHouseSearchEnabled =
        process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH === 'true'

      if (
        criteria.sort &&
        criteria.sort !== 'newest' &&
        (!rawText || !clickHouseSearchEnabled)
      ) {
        throw new Error(
          rawText
            ? 'This search order requires the ClickHouse search service.'
            : 'Search ordering requires a text query.',
        )
      }

      if (rawText && clickHouseSearchEnabled) {
        try {
          const clickHouseTweets = await searchClickHousePage(
            criteria,
            page,
            pageSize,
          )
          const finalizedTweets = await finalizeTweets(
            supabase,
            clickHouseTweets,
            criteria,
          )
          return {
            tweets: finalizedTweets,
            totalCount: finalizedTweets.length === 0 ? 0 : null,
            error: null,
          }
        } catch (error) {
          console.warn(
            'ClickHouse tweet search failed; falling back to Supabase:',
            error,
          )
          if (criteria.sort && criteria.sort !== 'newest') throw error
        }
      }

      // Multi-word phrase search: use FTS 'simple' config via RPC.
      // The 'simple' config doesn't drop stop words, so phraseto_tsquery
      // matches exact word order for ALL words (including "you", "can", etc.).
      // Backed by a GIN index on to_tsvector('simple', full_text).
      if (rawText && rawText.trim().split(/\s+/).length > 1) {
        const phraseResults = await searchExactPhrase(
          supabase,
          rawText,
          criteria,
          pageSize,
          offset,
        )
        return {
          tweets: await finalizeTweets(supabase, phraseResults, criteria),
          totalCount: null,
          error: null,
        }
      }

      // Single-word or pre-formatted query — single query path
      const searchParams: SearchParams = {
        search_query: criteria.searchQuery || '',
        ...baseParams,
      }
      const rpcData = await rpcSearchTweets(
        supabase,
        searchParams,
        pageSize,
        offset,
      )

      if (!rpcData || rpcData.length === 0) {
        return {
          tweets: [],
          totalCount: rpcData?.length === 0 ? 0 : null,
          error: null,
        }
      }
      return {
        tweets: await finalizeTweets(
          supabase,
          transformRawTweetsToTimelineTweets(rpcData, true),
          criteria,
        ),
        totalCount: null,
        error: null,
      }
    } catch (error: any) {
      console.error('Error fetching tweets via RPC:', error)
      if (error.message && error.message.includes('statement timeout')) {
        return {
          tweets: [],
          totalCount: 0,
          error: {
            message:
              'Search query timed out. Please try a more specific search.',
            details: error,
          },
        }
      }
      return { tweets: [], totalCount: 0, error }
    }
  } else {
    // Fallback to direct Supabase query for filters not supported by the main search_tweets RPC
    // (e.g., specific userId, isRootTweet, mentionedUser, hashtags without other search terms)
    let query = supabase.from('tweets').select(
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
            avatar_media_url,
            archive_upload_id
          )
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        )
      `,
      { count: 'estimated' },
    )

    if (criteria.userId) {
      query = query.eq('account_id', criteria.userId)
    }

    // Note: fromUsername is handled by RPC path. If it reaches here, it means no other RPC criteria were met.
    // However, if we wanted to support fromUsername directly here (e.g. if RPC path was removed),
    // it would need to be: query = query.eq('all_account.username', criteria.fromUsername);
    // Same for replyToUsername: query = query.eq('reply_to_username', criteria.replyToUsername);

    if (criteria.mentionedUser) {
      // Ensure 'all_account' is the correct alias if filtering on joined table.
      // Here, mentionedUser is likely in 'full_text' of the 'tweets' table.
      query = query.ilike('full_text', `%@${criteria.mentionedUser}%`)
    }

    if (criteria.isRootTweet) {
      query = query.is('reply_to_tweet_id', null)
    }

    if (criteria.hashtags && criteria.hashtags.length > 0) {
      criteria.hashtags.forEach((tag) => {
        query = query.ilike('full_text', `%#${tag}%`)
      })
    }

    if (criteria.excludeRetweets) {
      query = query.not('full_text', 'like', 'RT @%')
    }

    // Date filters are handled by RPC path if present.
    // If they were to be handled here, they would be:
    // if (criteria.startDate) {
    //   query = query.gte('created_at', criteria.startDate);
    // }
    // if (criteria.endDate) {
    //   query = query.lte('created_at', criteria.endDate);
    // }

    query = query.order('created_at', { ascending: false })
    query = query.range((page - 1) * pageSize, page * pageSize - 1)

    const { data: rawData, error, count } = await query

    if (error) {
      console.error('Error fetching tweets directly:', error) // Clarified error source
      if (error.message && error.message.includes('statement timeout')) {
        return {
          tweets: [],
          totalCount: 0,
          error: {
            message: 'Query timed out. Please try a more specific query.',
            details: error,
          },
        }
      }
      return { tweets: [], totalCount: 0, error }
    }
    if (!rawData) {
      return { tweets: [], totalCount: 0, error: null }
    }

    const transformedTweets = transformRawTweetsToTimelineTweets(rawData, false)
    return {
      tweets: await finalizeTweets(supabase, transformedTweets, criteria),
      totalCount: count,
      error: null,
    }
  }
}
