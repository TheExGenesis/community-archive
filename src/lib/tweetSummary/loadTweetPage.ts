import 'server-only'
import { cache } from 'react'
import { canReadTweetConversation } from '@/lib/tweetConversationAccess'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getStoredTweetPageSummary } from './store'

/** Shared by the page, metadata, and share image. Restricted conversation
 * data is removed before it can reach a guest render or client props. */
export const loadTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const canReadConversation = await canReadTweetConversation()
    const data = await getTweetPageData(tweetId, {
      clickhouseOnly,
      deferQuotePosts: true,
      skipQuotePosts: !canReadConversation,
    })
    if (!data.tweet) return null
    if (!canReadConversation) {
      return {
        tweet: data.tweet,
        threadTree: null,
        quotingTweets: [],
        quotingTweetCount: 0,
        quotePosts: undefined,
        subject: buildTweetPageSubject(data.tweet, null),
        summary: null,
        summaryPending: false,
        canReadConversation: false,
      }
    }
    const subject = buildTweetPageSubject(data.tweet, data.threadTree)
    const page = { ...data, tweet: data.tweet, subject, canReadConversation }
    const stored = await getStoredTweetPageSummary(subject)
    if (stored !== 'missing')
      return { ...page, summary: stored, summaryPending: false }
    return { ...page, summary: null, summaryPending: true }
  },
)
