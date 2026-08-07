import type { SupabaseClient } from '@supabase/supabase-js'
import { getLatestAvatarMediaUrl } from '@/lib/avatar'
import type { TimelineTweet } from '@/lib/types'

type QuoteRelation = {
  tweet_id: string
  quoted_tweet_id: string
}

function deletedQuotedTweet(tweetId: string) {
  return {
    tweet_id: tweetId,
    account_id: '',
    created_at: '',
    full_text: '',
    retweet_count: 0,
    favorite_count: 0,
    username: '',
    account_display_name: '',
    is_deleted: true as const,
  }
}

/**
 * Batch-load quote relationships and quoted tweet bodies for search results.
 * Original tweet media is already returned by both search backends.
 */
export async function enrichSearchTweets(
  supabase: SupabaseClient,
  tweets: TimelineTweet[],
): Promise<TimelineTweet[]> {
  if (tweets.length === 0) return tweets

  const tweetIds = tweets.map((tweet) => tweet.tweet_id)
  const { data: quoteRows, error: quoteError } = await supabase
    .from('quote_tweets')
    .select('tweet_id, quoted_tweet_id')
    .in('tweet_id', tweetIds)

  if (quoteError) {
    console.warn('Could not load quote relationships for search:', quoteError)
    return tweets
  }

  const quoteRelations = (quoteRows || []) as QuoteRelation[]
  if (quoteRelations.length === 0) return tweets

  const quotedTweetIds = Array.from(
    new Set(quoteRelations.map((row) => row.quoted_tweet_id)),
  )
  const { data: quotedRows, error: quotedError } = await supabase
    .from('tweets')
    .select(
      `
        tweet_id,
        account_id,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        account:all_account!inner (
          username,
          account_display_name,
          profile:all_profile (
            avatar_media_url,
            archive_upload_id
          )
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        )
      `,
    )
    .in('tweet_id', quotedTweetIds)

  if (quotedError) {
    console.warn('Could not load quoted tweets for search:', quotedError)
  }

  const quotedById = new Map(
    ((quotedRows || []) as any[]).map((quotedTweet) => {
      const account = Array.isArray(quotedTweet.account)
        ? quotedTweet.account[0]
        : quotedTweet.account
      const avatarMediaUrl = getLatestAvatarMediaUrl(account?.profile)

      return [
        quotedTweet.tweet_id,
        {
          tweet_id: quotedTweet.tweet_id,
          account_id: quotedTweet.account_id,
          created_at: quotedTweet.created_at,
          full_text: quotedTweet.full_text,
          retweet_count: quotedTweet.retweet_count,
          favorite_count: quotedTweet.favorite_count,
          avatar_media_url: avatarMediaUrl || undefined,
          username: account?.username || 'unknown_user',
          account_display_name:
            account?.account_display_name ||
            account?.username ||
            'Unknown User',
          media: quotedTweet.media || [],
        },
      ] as const
    }),
  )
  const relationByTweetId = new Map(
    quoteRelations.map((row) => [row.tweet_id, row.quoted_tweet_id]),
  )

  return tweets.map((tweet) => {
    const quotedTweetId = relationByTweetId.get(tweet.tweet_id)
    if (!quotedTweetId) return tweet

    return {
      ...tweet,
      quote_tweet_id: quotedTweetId,
      quoted_tweet:
        quotedById.get(quotedTweetId) || deletedQuotedTweet(quotedTweetId),
    }
  })
}
