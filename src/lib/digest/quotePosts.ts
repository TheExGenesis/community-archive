import 'server-only'

import { getQuotingTweetsPage } from '@/lib/quotingTweets'
import { quoteTweetToPortalTweet } from '@/lib/portal/quoteTweet'
import type { PortalTweet } from '@/lib/portal/types'

const TWEET_ID_PATTERN = /^\d{1,20}$/
const INITIAL_QUOTE_POST_LIMIT = 50

export interface DigestQuotePosts {
  bangerId: string
  tweets: PortalTweet[]
  totalCount: number
}

/**
 * Load the archived quote posts for each featured banger. The digest stores
 * only the model-selected commentary, so this fills in the quote posts that
 * were available to the editor but were not selected for the story.
 */
export async function loadDigestQuotePosts(
  bangers: PortalTweet[],
): Promise<DigestQuotePosts[]> {
  const results = await Promise.all(
    bangers
      .filter(({ id }) => TWEET_ID_PATTERN.test(id))
      .map(async (banger): Promise<DigestQuotePosts> => {
        try {
          const page = await getQuotingTweetsPage(
            banger.id,
            0,
            INITIAL_QUOTE_POST_LIMIT,
          )
          return {
            bangerId: banger.id,
            tweets: page.tweets.map((tweet) =>
              quoteTweetToPortalTweet(tweet, banger),
            ),
            totalCount: page.totalCount,
          }
        } catch (error) {
          console.error('Digest quote-post read failed:', {
            tweetId: banger.id,
            error: error instanceof Error ? error.message : String(error),
          })
          return { bangerId: banger.id, tweets: [], totalCount: 0 }
        }
      }),
  )

  return results
}
