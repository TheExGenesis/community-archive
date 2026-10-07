import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { isCrawlerAgent } from '@/lib/crawlers'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getTweetPageSummary } from './store'

/**
 * Permalink data plus its subject and generated summary. Metadata, the page
 * body, and the share image all read through this, so one request loads once.
 * Crawlers get stored summaries but never trigger a paid generation.
 */
export const loadTweetPage = cache(
  async (tweetId: string, clickhouseOnly = false) => {
    const data = await getTweetPageData(tweetId, { clickhouseOnly })
    if (!data.tweet) return null
    const subject = buildTweetPageSubject(data.tweet, data.threadTree)
    const allowGeneration = !isCrawlerAgent(headers().get('user-agent'))
    const summary = await getTweetPageSummary(subject, allowGeneration)
    return { ...data, tweet: data.tweet, subject, summary }
  },
)
