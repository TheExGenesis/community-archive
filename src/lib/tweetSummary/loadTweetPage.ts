import 'server-only'
import { cache } from 'react'
import { canReadTweetConversation } from '@/lib/tweetConversationAccess'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getStoredTweetPageSummary } from './store'
import type { GeneratedSummary } from './generation'

/**
 * The signed-out view: the main tweet alone, with no thread, quotes, or
 * summary. It never reads the request, so the /guest/tweets route can render
 * it once and serve every cookie-less visitor from the cache, and the share
 * image (always fetched without a session) reads the same record.
 */
export const loadGuestTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const data = await getTweetPageData(tweetId, {
      clickhouseOnly,
      deferQuotePosts: true,
      skipQuotePosts: true,
    })
    if (!data.tweet) return null
    return {
      tweet: data.tweet,
      threadTree: null,
      quotingTweets: [],
      quotingTweetCount: 0,
      quotePosts: undefined,
      subject: buildTweetPageSubject(data.tweet, null),
      summary: null as GeneratedSummary | null,
      summaryPending: false,
      canReadConversation: false,
    }
  },
)

/**
 * Shared by the dynamic page and its metadata. Restricted conversation data
 * is removed before it can reach a guest render or client props: a visitor
 * without live consent gets exactly the cached guest view.
 */
export const loadTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const canReadConversation = await canReadTweetConversation()
    if (!canReadConversation) return loadGuestTweetPage(tweetId, clickhouseOnly)

    const data = await getTweetPageData(tweetId, {
      clickhouseOnly,
      deferQuotePosts: true,
      skipQuotePosts: false,
    })
    if (!data.tweet) return null
    const subject = buildTweetPageSubject(data.tweet, data.threadTree)
    const page = { ...data, tweet: data.tweet, subject, canReadConversation }
    const stored = await getStoredTweetPageSummary(subject)
    if (stored !== 'missing')
      return { ...page, summary: stored, summaryPending: false }
    return { ...page, summary: null, summaryPending: true }
  },
)

export type TweetPage = NonNullable<Awaited<ReturnType<typeof loadTweetPage>>>
