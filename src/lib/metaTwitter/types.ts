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
  media: { media_url: string; media_type: string; width: number; height: number }[]
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
}

export interface ProfileHeaderData {
  account_id: string
  username: string
  account_display_name: string
  created_at: string
  num_tweets: number
  num_followers: number
  num_following: number
  num_likes: number
  bio: string | null
  website: string | null
  location: string | null
  avatar_media_url: string | null
  header_media_url: string | null
}
