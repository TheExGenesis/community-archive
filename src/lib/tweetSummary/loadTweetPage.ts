import 'server-only'
import { cache } from 'react'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getStoredTweetPageSummary } from './store'

/**
 * Permalink data plus its subject and any stored summary. Metadata, the page
 * body, and the share image all read through this, so one request loads
 * once. It never reads the request: the page is cached and shared by every
 * visitor, so a missing summary is reported as `summaryMissing` and the
 * browser asks for generation only when its visitor is signed in.
 */
export const loadTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const data = await getTweetPageData(tweetId, {
      clickhouseOnly,
      deferQuotePosts: true,
    })
    if (!data.tweet) return null
    const subject = buildTweetPageSubject(data.tweet, data.threadTree)
    const page = { ...data, tweet: data.tweet, subject }
    const stored = await getStoredTweetPageSummary(subject)
    if (stored !== 'missing')
      return { ...page, summary: stored, summaryMissing: false }
    return { ...page, summary: null, summaryMissing: true }
  },
)
