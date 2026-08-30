export const OWN_TWEETS_PAGE_SIZE = 10

export interface OwnTweet {
  tweet_id: string
  created_at: string
  full_text: string
  favorite_count: number | null
  retweet_count: number | null
}
