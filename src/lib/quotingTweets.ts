import 'server-only'

import type { TweetData, TweetMedia } from '@/components/TweetComponent'
import { fetchClickHouseQuotePosts } from '@/lib/clickhouseQuotePosts'
import { isClickHouseReadsEnabled } from '@/lib/clickhouseGateway'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export interface QuotingTweetsPage {
  tweets: TweetData[]
  totalCount: number
  nextOffset: number | null
}

function nextOffset(
  offset: number,
  loaded: number,
  totalCount: number,
): number | null {
  const next = offset + loaded
  return loaded > 0 && next < totalCount ? next : null
}

async function getSupabaseQuotingTweetsPage(
  tweetId: string,
  offset: number,
  limit: number,
): Promise<QuotingTweetsPage> {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: relations,
    count,
    error: relationError,
  } = await supabase
    .from('quote_tweets')
    .select('tweet_id', { count: 'exact' })
    .eq('quoted_tweet_id', tweetId)
    .order('tweet_id', { ascending: false })
    .range(offset, offset + limit - 1)

  if (relationError) throw relationError
  const tweetIds = (relations ?? []).map(({ tweet_id }) => tweet_id)
  const totalCount = count ?? tweetIds.length
  if (tweetIds.length === 0) {
    return { tweets: [], totalCount, nextOffset: null }
  }

  const [
    { data: rows, error: tweetsError },
    { data: mediaRows, error: mediaError },
  ] = await Promise.all([
    supabase.from('enriched_tweets').select('*').in('tweet_id', tweetIds),
    supabase.from('tweet_media').select('*').in('tweet_id', tweetIds),
  ])
  if (tweetsError) throw tweetsError
  if (mediaError) throw mediaError

  const mediaByTweet = new Map<string, TweetMedia[]>()
  for (const media of mediaRows ?? []) {
    const current = mediaByTweet.get(media.tweet_id) ?? []
    current.push({
      media_url: media.media_url,
      media_type: media.media_type,
      width: media.width ?? undefined,
      height: media.height ?? undefined,
    })
    mediaByTweet.set(media.tweet_id, current)
  }
  const rowById = new Map(
    (rows ?? []).flatMap((row) =>
      row.tweet_id ? ([[row.tweet_id, row]] as const) : [],
    ),
  )
  const tweets = tweetIds.flatMap((id): TweetData[] => {
    const row = rowById.get(id)
    if (
      !row?.tweet_id ||
      !row.account_id ||
      !row.created_at ||
      row.full_text === null
    ) {
      return []
    }
    const username = row.username || 'unknown_user'
    return [
      {
        tweet_id: row.tweet_id,
        account_id: row.account_id,
        created_at: row.created_at,
        full_text: row.full_text,
        retweet_count: row.retweet_count,
        favorite_count: row.favorite_count ?? 0,
        reply_to_tweet_id: row.reply_to_tweet_id,
        reply_to_username: row.reply_to_username ?? undefined,
        quote_tweet_id: tweetId,
        retweeted_tweet_id: null,
        avatar_media_url: row.avatar_media_url,
        username,
        account_display_name: row.account_display_name || username,
        media: mediaByTweet.get(row.tweet_id) ?? [],
        urls: [],
      },
    ]
  })

  return {
    tweets,
    totalCount,
    nextOffset: nextOffset(offset, tweetIds.length, totalCount),
  }
}

export async function getQuotingTweetsPage(
  tweetId: string,
  offset = 0,
  limit = 12,
): Promise<QuotingTweetsPage> {
  const safeOffset = Math.max(0, Math.min(5_000, Math.trunc(offset)))
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
  if (isClickHouseReadsEnabled()) {
    const page = await fetchClickHouseQuotePosts(tweetId, safeLimit, safeOffset)
    return {
      ...page,
      nextOffset: nextOffset(safeOffset, page.tweets.length, page.totalCount),
    }
  }
  return getSupabaseQuotingTweetsPage(tweetId, safeOffset, safeLimit)
}
