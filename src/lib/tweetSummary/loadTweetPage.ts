import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { isCrawlerAgent, isLinkPreviewAgent } from '@/lib/crawlers'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getStoredTweetPageSummary, getTweetPageSummary } from './store'

/**
 * Permalink data plus its subject and any summary that can be shown without
 * waiting. Metadata, the page body, and the share image all read through
 * this, so one request loads once. A first visit by a person gets the page
 * at once with `summaryPending` set, and the body streams the summary in.
 * Unfurlers only read the head, so they wait for generation instead.
 * Crawlers get stored summaries but never trigger a paid generation.
 */
export const loadTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const data = await getTweetPageData(tweetId, { clickhouseOnly })
    if (!data.tweet) return null
    const subject = buildTweetPageSubject(data.tweet, data.threadTree)
    const page = { ...data, tweet: data.tweet, subject }
    const stored = await getStoredTweetPageSummary(subject)
    if (stored !== 'missing')
      return { ...page, summary: stored, summaryPending: false }

    const userAgent = headers().get('user-agent')
    if (isLinkPreviewAgent(userAgent))
      return {
        ...page,
        summary: await getTweetPageSummary(subject, true),
        summaryPending: false,
      }
    return {
      ...page,
      summary: null,
      summaryPending: !isCrawlerAgent(userAgent),
    }
  },
)
