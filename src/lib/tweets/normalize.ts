import type { TweetData, TweetInput } from './types'

/** Resolve source-specific account nesting once, without truncating text or payloads. */
export function normalizeTweet(tweet: TweetInput): TweetData {
  return {
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id ?? '',
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    favorite_count: tweet.favorite_count ?? 0,
    retweet_count: tweet.retweet_count ?? null,
    reply_to_tweet_id: tweet.reply_to_tweet_id ?? null,
    reply_to_username: tweet.reply_to_username || undefined,
    quote_tweet_id: tweet.quote_tweet_id ?? null,
    retweeted_tweet_id: tweet.retweeted_tweet_id ?? null,
    username: tweet.username || tweet.account?.username || 'Unknown',
    account_display_name:
      tweet.account_display_name ||
      tweet.account?.account_display_name ||
      'Unknown',
    avatar_media_url:
      tweet.avatar_media_url ||
      tweet.account?.profile?.avatar_media_url ||
      null,
    media: tweet.media ?? [],
    urls: tweet.urls ?? [],
    quoted_tweet: tweet.quoted_tweet ?? undefined,
    mentioned_users: tweet.mentioned_users,
  }
}
