import 'server-only'

import type { TweetData } from '@/lib/tweets/types'
import { fetchClickHouseQuotePosts } from '@/lib/clickhouseQuotePosts'

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

export async function getQuotingTweetsPage(
  tweetId: string,
  offset = 0,
  limit = 12,
): Promise<QuotingTweetsPage> {
  const safeOffset = Math.max(0, Math.min(5_000, Math.trunc(offset)))
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
  // ClickHouse is the only source; the Supabase quote_tweets read was retired.
  const page = await fetchClickHouseQuotePosts(tweetId, safeLimit, safeOffset)
  return {
    ...page,
    nextOffset: nextOffset(safeOffset, page.tweets.length, page.totalCount),
  }
}
