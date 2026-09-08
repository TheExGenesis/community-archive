/** Tweet contracts shared by server adapters and client renderers. */
export interface TweetMedia {
  media_url: string
  media_type: string
  width?: number
  height?: number
}

export interface TweetUrl {
  expanded_url: string | null
  display_url: string
}

export interface TweetData {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  reply_to_tweet_id: string | null
  quote_tweet_id: string | null
  retweeted_tweet_id: string | null
  avatar_media_url: string | null
  username: string
  account_display_name: string
  media: TweetMedia[]
  urls: TweetUrl[]
  reply_to_username?: string
  // For quote tweets
  quoted_tweet?: {
    tweet_id: string
    account_id: string
    created_at: string
    full_text: string
    retweet_count: number | null
    favorite_count: number
    avatar_media_url?: string
    username: string
    account_display_name: string
    media?: TweetMedia[]
    // True when the quoted tweet is missing from our archive AND wasn't recoverable
    // via Twitter syndication; renderer shows a tombstone.
    is_deleted?: boolean
    // True when the quoted tweet was hydrated at render time from Twitter's public
    // syndication endpoint (not from our DB); renderer marks it as not archived.
    from_external?: boolean
  }
  // For RT tweets with mentioned user data
  mentioned_users?: {
    mentioned_user: {
      user_id: string
      name: string
      screen_name: string
      account?: {
        username: string
        account_display_name: string
        profile?: {
          avatar_media_url: string
        }
      }
    }
  }[]
}

/** Nested account alias retained by existing API responses. */
export interface TweetAccount {
  username?: string
  account_display_name?: string
  profile?: { avatar_media_url?: string }
}

/** Accepted shapes at the search/list boundary. Normalize before rendering. */
export type TweetInput = Pick<
  TweetData,
  'tweet_id' | 'created_at' | 'full_text'
> &
  Partial<Omit<TweetData, 'reply_to_username' | 'quoted_tweet'>> & {
    reply_to_username?: string | null
    quoted_tweet?: TweetData['quoted_tweet'] | null
    account?: TweetAccount
  }

/** Existing API response aliases remain stable for external consumers. */
export interface ArchiveTweetResponse extends TweetData {
  account?: TweetAccount
}
