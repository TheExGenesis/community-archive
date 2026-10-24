import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { buildTweetPageSubject } from './subject'
import { getStoredTweetPageSummary } from './store'

async function isSignedIn() {
  try {
    const supabase = createServerClient(await cookies())
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return Boolean(user)
  } catch {
    return false
  }
}

/**
 * Permalink data plus its subject and any summary that can be shown without
 * waiting. Metadata, the page body, and the share image all read through
 * this, so one request loads once. Only a signed-in visitor triggers a paid
 * generation: they get the page at once with `summaryPending` set, and the
 * body streams the summary in. Everyone else, including crawlers and
 * unfurlers, sees stored summaries only.
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
      return { ...page, summary: stored, summaryPending: false }
    return { ...page, summary: null, summaryPending: await isSignedIn() }
  },
)
