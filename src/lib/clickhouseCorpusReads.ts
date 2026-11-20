import 'server-only'
import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from './clickhouseGateway'
import type { ClickHouseTweetDetail } from './clickhouseTweetPage'

/**
 * Server reads of the ClickHouse gateway routes that replaced the website's
 * PostgreSQL corpus reads (tweets, tweet_urls, quote_tweets, enriched_tweets,
 * user_mentions). Contract: ops/clickhouse-query-gateway/README.md, "Website
 * corpus reads", in the control-panel repository. Every function throws on a
 * gateway failure; there is no PostgreSQL fallback.
 */

/** The gateway rejects more than this many ids per request with a 400. */
export const CORPUS_READ_MAX_IDS = 100

const NUMERIC_ID = /^\d{1,20}$/

export interface ClickHouseTweetCard extends ClickHouseTweetDetail {
  conversationId: string | null
  quoteTweetId: string | null
  quotedTweet: ClickHouseTweetDetail | null
  urls: Array<{
    url: string
    expandedUrl: string | null
    displayUrl: string | null
  }>
}

export interface ClickHouseQuoteAuthor {
  tweetId: string
  quotedTweetId: string
  accountId: string
  username: string | null
}

export interface ClickHouseTopMentionedUser {
  accountId: string
  screenName: string
  name: string | null
  avatarMediaUrl: string | null
  mentionCount: string | number
  hasArchive: boolean
}

interface CorpusReadOptions {
  fetcher?: AnalyticsGatewayFetcher
}

function uniqueIds(ids: Iterable<string>): string[] {
  return Array.from(
    new Set(Array.from(ids).filter((id) => NUMERIC_ID.test(id))),
  )
}

function chunks<T>(items: T[], size = CORPUS_READ_MAX_IDS): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size))
  }
  return result
}

function idParams(ids: string[]): URLSearchParams {
  return new URLSearchParams({ ids: ids.join(',') })
}

/**
 * Tweet cards keyed by tweet id. Ids the corpus lacks, and deleted or
 * opted-out tweets, are absent from the map.
 */
export async function fetchTweetCards(
  tweetIds: Iterable<string>,
  { fetcher = fetchAnalyticsGatewayJson }: CorpusReadOptions = {},
): Promise<Map<string, ClickHouseTweetCard>> {
  const ids = uniqueIds(tweetIds)
  const responses = await Promise.all(
    chunks(ids).map((chunk) =>
      fetcher<{ data: { tweets: ClickHouseTweetCard[] } }>(
        ['tweet-cards'],
        idParams(chunk),
      ),
    ),
  )
  const cards = new Map<string, ClickHouseTweetCard>()
  for (const response of responses) {
    if (!Array.isArray(response?.data?.tweets))
      throw new Error('ClickHouse tweet-cards returned an invalid response')
    for (const card of response.data.tweets) cards.set(card.tweetId, card)
  }
  return cards
}

/**
 * Every visible quote of the given tweets, with its author. The gateway caps
 * one response at 10,000 quotes and sets `truncated`; a truncated batch is
 * split and read again, so only a single tweet with more than 10,000 quotes
 * can come back incomplete. That tweet's quotes are then a lower bound,
 * reported in `truncatedTweetIds`.
 */
export async function fetchQuoteAuthors(
  quotedTweetIds: Iterable<string>,
  { fetcher = fetchAnalyticsGatewayJson }: CorpusReadOptions = {},
): Promise<{ quotes: ClickHouseQuoteAuthor[]; truncatedTweetIds: string[] }> {
  const quotes: ClickHouseQuoteAuthor[] = []
  const truncatedTweetIds: string[] = []

  async function read(ids: string[]): Promise<void> {
    const response = await fetcher<{
      data: { quotes: ClickHouseQuoteAuthor[]; truncated: boolean }
    }>(['quote-authors'], idParams(ids))
    if (!Array.isArray(response?.data?.quotes))
      throw new Error('ClickHouse quote-authors returned an invalid response')
    if (response.data.truncated && ids.length > 1) {
      const middle = Math.ceil(ids.length / 2)
      await Promise.all([read(ids.slice(0, middle)), read(ids.slice(middle))])
      return
    }
    if (response.data.truncated) truncatedTweetIds.push(ids[0])
    quotes.push(...response.data.quotes)
  }

  await Promise.all(chunks(uniqueIds(quotedTweetIds)).map(read))
  return { quotes, truncatedTweetIds }
}

/** Visible tweets per account; every requested id is answered, 0 when absent. */
export async function fetchAccountTweetCounts(
  accountIds: Iterable<string>,
  { fetcher = fetchAnalyticsGatewayJson }: CorpusReadOptions = {},
): Promise<Map<string, number>> {
  const responses = await Promise.all(
    chunks(uniqueIds(accountIds)).map((chunk) =>
      fetcher<{
        data: { counts: Array<{ accountId: string; tweetCount: string }> }
      }>(['account-tweet-counts'], idParams(chunk)),
    ),
  )
  const counts = new Map<string, number>()
  for (const response of responses) {
    if (!Array.isArray(response?.data?.counts))
      throw new Error(
        'ClickHouse account-tweet-counts returned an invalid response',
      )
    for (const row of response.data.counts) {
      counts.set(row.accountId, Number(row.tweetCount) || 0)
    }
  }
  return counts
}

/** The archive-wide most-mentioned accounts, ranked by the gateway (6 h cache). */
export async function fetchTopMentionedUsers(
  limit: number,
  { fetcher = fetchAnalyticsGatewayJson }: CorpusReadOptions = {},
): Promise<ClickHouseTopMentionedUser[]> {
  const bounded = Math.min(50, Math.max(1, Math.trunc(limit)))
  const response = await fetcher<{
    data: { users: ClickHouseTopMentionedUser[] }
  }>(['top-mentioned'], new URLSearchParams({ limit: String(bounded) }))
  if (!Array.isArray(response?.data?.users))
    throw new Error('ClickHouse top-mentioned returned an invalid response')
  return response.data.users
}
