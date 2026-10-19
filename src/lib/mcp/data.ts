import 'server-only'

import { createServerAnonClient } from '@/utils/supabase'
import {
  fetchAnalyticsGatewayJson,
  clickHouseSearchGatewayBaseUrl,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import {
  mapSearchTweets,
  type ClickHouseSearchResponse,
} from '@/lib/clickhouseSearch'
import {
  fetchClickHouseTweetPageData,
  fetchClickHouseTweetThreadPageData,
} from '@/lib/clickhouseTweetPage'
import { getClickHouseQuotingTweetsPage } from '@/lib/quotingTweets'
import { enrichSearchTweets } from '@/lib/searchTweetEnrichments'
import { getAppPolicy } from '@/lib/community-apps/data'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getPublicBangersPage } from '@/lib/publicBangers'
import { getPublishedDigest } from '@/lib/digest/data'
import { compactDigest } from '@/lib/companion/projections'
import { normalizeTweet } from '@/lib/tweets/normalize'
import type { TweetInput } from '@/lib/tweets/types'
import { decodeTweetText } from '@/lib/tweetText'

type Policy = Awaited<ReturnType<typeof getAppPolicy>>
const archiveUrl = (path: string) => `https://www.community-archive.org${path}`

const freshGateway: AnalyticsGatewayFetcher = (path, params, options) =>
  fetchAnalyticsGatewayJson(path, params, { ...options, revalidate: undefined })

function allowed(policy: Policy, username: string, accountId?: string) {
  return (
    !policy.blocked.has(username.toLowerCase()) &&
    !policy.blockedIds.has(accountId ?? '')
  )
}

function pagePosition(nextOffset: number | null) {
  return {
    nextOffset: nextOffset !== null && nextOffset <= 5000 ? nextOffset : null,
    paginationLimitReached: nextOffset !== null && nextOffset > 5000,
  }
}

function archiveTweets(tweets: TweetInput[], policy: Policy) {
  return tweets
    .map(normalizeTweet)
    .filter((t) => allowed(policy, t.username, t.account_id))
    .map((tweet) => {
      const quoted = tweet.quoted_tweet
      const quoteAllowed =
        !quoted || allowed(policy, quoted.username, quoted.account_id)
      return {
        ...tweet,
        full_text: decodeTweetText(tweet.full_text),
        href: archiveUrl(`/tweets/${tweet.tweet_id}`),
        quote_tweet_id: quoteAllowed ? tweet.quote_tweet_id : null,
        quoted_tweet:
          quoted && quoteAllowed
            ? {
                ...quoted,
                full_text: decodeTweetText(quoted.full_text),
                href: archiveUrl(`/tweets/${quoted.tweet_id}`),
              }
            : undefined,
      }
    })
}

function portalTweets<
  T extends {
    id: string
    username: string
    text: string
    accountId?: string
    quotedTweet?: {
      id: string
      username: string
      text: string
      accountId?: string
    }
  },
>(tweets: T[], policy: Policy) {
  return tweets
    .filter((t) => allowed(policy, t.username, t.accountId))
    .map((tweet) => ({
      ...tweet,
      text: decodeTweetText(tweet.text),
      href: archiveUrl(`/tweets/${tweet.id}`),
      quotedTweet:
        tweet.quotedTweet &&
        allowed(policy, tweet.quotedTweet.username, tweet.quotedTweet.accountId)
          ? {
              ...tweet.quotedTweet,
              text: decodeTweetText(tweet.quotedTweet.text),
              href: archiveUrl(`/tweets/${tweet.quotedTweet.id}`),
            }
          : undefined,
    }))
}

export async function searchTweets(params: URLSearchParams) {
  const page = await freshGateway<ClickHouseSearchResponse>(
    ['search'],
    params,
    {
      baseUrl: clickHouseSearchGatewayBaseUrl(),
      timeoutMs: 25000,
    },
  )
  const tweets = await enrichSearchTweets(
    createServerAnonClient(),
    mapSearchTweets(page),
  )
  return {
    tweets: archiveTweets(tweets, await getAppPolicy([])),
    ...pagePosition(page.data.nextOffset),
  }
}

export async function getTweet(tweetId: string) {
  const tweet = await fetchClickHouseTweetPageData(tweetId, freshGateway)
  return {
    tweet: tweet
      ? (archiveTweets([tweet], await getAppPolicy([]))[0] ?? null)
      : null,
  }
}

export async function getThread(tweetId: string, limit: number) {
  const page = await fetchClickHouseTweetThreadPageData(
    tweetId,
    (path, params = new URLSearchParams(), options) => {
      params.set('limit', String(limit))
      return freshGateway(path, params, options)
    },
  )
  if (!page) return { thread: null }
  const rows = page.threadTree
    ? Object.values(page.threadTree.tweets).filter(
        (t) => !t.is_deleted_placeholder,
      )
    : [page.tweet]
  const tweets = archiveTweets(rows, await getAppPolicy([]))
  if (!tweets.some((t) => t.tweet_id === tweetId)) return { thread: null }
  const ids = new Set(tweets.map((t) => t.tweet_id))
  return {
    thread: {
      tweetId,
      tweets,
      missingParentIds: Array.from(
        new Set(
          tweets.flatMap((t) =>
            t.reply_to_tweet_id && !ids.has(t.reply_to_tweet_id)
              ? [t.reply_to_tweet_id]
              : [],
          ),
        ),
      ),
      limitReached: rows.length >= limit,
      coverage:
        'This response contains available archive records. The conversation can be incomplete.',
      href: archiveUrl(`/tweets/${tweetId}`),
    },
  }
}

export async function getQuoteTweets(
  tweetId: string,
  limit: number,
  offset: number,
) {
  const page = await getClickHouseQuotingTweetsPage(
    tweetId,
    offset,
    limit,
    freshGateway,
  )
  return {
    tweets: archiveTweets(page.tweets, await getAppPolicy([])),
    totalCount: page.totalCount,
    ...pagePosition(page.nextOffset),
    href: archiveUrl(`/tweets/${tweetId}`),
  }
}

export async function getProfile(identifier: string) {
  const resolved = await resolveProfileCore(identifier)
  return {
    profile: resolved
      ? {
          ...resolved.profile,
          href: archiveUrl(`/user/${resolved.accountId}`),
        }
      : null,
  }
}

export async function getBangers(
  input: Parameters<typeof getPublicBangersPage>[0],
) {
  const page = await getPublicBangersPage(input)
  return {
    ...('pagination' in page
      ? { pagination: { ...page.pagination, ...pagePosition(page.nextOffset) } }
      : pagePosition(page.nextOffset)),
    tweets: portalTweets(page.tweets, await getAppPolicy([])),
    href: archiveUrl(page.href),
  }
}

export async function getDigest(
  date?: string,
  query?: string,
  username?: string,
) {
  const edition = await getPublishedDigest(date, { strict: true })
  if (!edition || edition.status !== 'published' || edition.isPreview)
    return { digest: null }
  const digest = compactDigest(edition, query, username)
  const policy = await getAppPolicy([])
  return {
    digest: {
      ...digest,
      stories: digest.stories.map((story) => ({
        ...story,
        tweets: portalTweets(story.tweets, policy),
        href: archiveUrl(story.href),
      })),
      href: archiveUrl(`/digest/${edition.digestDate}`),
    },
  }
}
