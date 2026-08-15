import 'server-only'

import { fetchSyndicatedTweets } from './twitterSyndication'

interface ProfileTweetText {
  tweet_id: string
  full_text: string
}

const likelyFlattenedText = (text: string) => {
  if (text.includes('\n') || text.includes('\r')) return false

  // Ignore URL host/path casing; the archive bug is the disappearance of a
  // separator between adjacent words, which commonly leaves a case boundary.
  const withoutUrls = text.replace(/https?:\/\/\S+/g, '')
  return /[a-z][A-Z]|\b[A-Z]{2,}[a-z]/.test(withoutUrls)
}

/**
 * Repair only the known archive-ingestion failure where control characters were
 * stripped from a profile tweet's stored text. The database remains the source
 * for every other field, and syndication failures leave the stored text intact.
 */
export async function repairProfileTweetText<T extends ProfileTweetText>(
  tweets: T[],
): Promise<T[]> {
  if (tweets.length === 0) return tweets

  const candidates = tweets.filter((tweet) =>
    likelyFlattenedText(tweet.full_text),
  )
  if (candidates.length === 0) return tweets

  const syndicated = await fetchSyndicatedTweets(
    candidates.map((tweet) => tweet.tweet_id),
    { limit: candidates.length },
  )

  return tweets.map((tweet) => {
    const syndicatedTweet = syndicated.get(tweet.tweet_id)
    if (syndicatedTweet?.tweet_id !== tweet.tweet_id) return tweet

    const replacement = syndicatedTweet.full_text
    if (!replacement?.includes('\n') && !replacement?.includes('\r')) {
      return tweet
    }

    return { ...tweet, full_text: replacement }
  })
}
