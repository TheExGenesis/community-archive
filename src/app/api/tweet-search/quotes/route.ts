import { browsingAuthError } from '@/lib/browsingAuth'
import { NextRequest, NextResponse } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'
import {
  CORPUS_READ_MAX_IDS,
  fetchTweetCards,
} from '@/lib/clickhouseCorpusReads'
import { deletedQuotedTweet, quotedTweet } from '@/lib/clickhouseTweetPage'
import type { SearchQuotedTweets } from '@/lib/searchTweetEnrichments'

export const dynamic = 'force-dynamic'
// Next to the gateway, like /api/tweet-search.
export const preferredRegion = 'arn1'

/**
 * Quoted tweets for one page of search results, read from the gateway's
 * tweet cards: `?ids=` lists the result tweet ids (at most 100), and the
 * response maps each result that quotes a tweet to the quoted card, or to the
 * deleted-tweet placeholder when the quoted tweet is outside the corpus.
 */
export async function GET(request: NextRequest) {
  const authError = await browsingAuthError()
  if (authError) return authError

  const ids = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',')
    .filter(Boolean)
  if (
    ids.length === 0 ||
    ids.length > CORPUS_READ_MAX_IDS ||
    ids.some((id) => !/^\d{1,20}$/.test(id))
  ) {
    return NextResponse.json(
      { error: `ids must be 1 to ${CORPUS_READ_MAX_IDS} tweet ids` },
      { status: 400 },
    )
  }

  try {
    const cards = await fetchTweetCards(ids)
    const quotes: SearchQuotedTweets = {}
    for (const card of Array.from(cards.values())) {
      if (!card.quoteTweetId) continue
      quotes[card.tweetId] = {
        quote_tweet_id: card.quoteTweetId,
        quoted_tweet: card.quotedTweet
          ? quotedTweet(card.quotedTweet)
          : deletedQuotedTweet(card.quoteTweetId),
      }
    }
    return NextResponse.json(
      { data: { quotes } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return reportApiError({
      request,
      route: '/api/tweet-search/quotes',
      status: 502,
      message: 'Quoted tweets are temporarily unavailable',
      upstream: 'gateway',
      error,
    })
  }
}
