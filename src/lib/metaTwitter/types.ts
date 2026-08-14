/** Shared Meta Twitter types, importable from both server and client code. */

export interface ArchiveTweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  favorite_count: number
  retweet_count: number | null
  reply_to_username: string | null
  username: string
  account_display_name: string
  avatar_media_url: string | null
  media: {
    media_url: string
    media_type: string
    width: number
    height: number
  }[]
}

export interface BangerTweet extends ArchiveTweet {
  quote_count: number
  quoting_accounts: number
  quote_tweet_id?: string | null
  quoted_tweet?: ArchiveTweet | null
  curation?: {
    is_featured: boolean
    position: number | null
  }
}

export interface ArchiveMediaItem {
  media_url: string
  media_type: string
  width: number
  height: number
  tweet_id: string
  created_at: string
  favorite_count: number
}

export interface ArchivePerson {
  user_id: string
  screen_name: string
  name: string | null
  interactions: number
  avatar_media_url?: string | null
  in_archive?: boolean
  curation?: {
    is_featured: boolean
    position: number | null
  }
}

export interface ProfileHeaderData {
  account_id: string
  username: string
  account_display_name: string
  created_at: string | null
  num_tweets: number | null
  num_followers: number | null
  num_following: number | null
  num_likes: number | null
  has_archive: boolean
  is_opted_in: boolean
  bio: string | null
  website: string | null
  location: string | null
  avatar_media_url: string | null
  header_media_url: string | null
}
