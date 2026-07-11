import { Database } from '@/database-types'
import { SupabaseClient } from '@supabase/supabase-js'

// Define the structure of each part of the archive
export interface Profile {
  description: {
    bio: string
    website: string
    location: string
  }
  avatarMediaUrl: string
  headerMediaUrl: string
}

export interface Account {
  createdVia: string
  username: string
  accountId: string
  createdAt: string
  accountDisplayName: string
}

export interface Tweet {
  id: string
  source: string
  entities: Record<string, any>
  favorite_count: number
  id_str: string
  retweet_count: number | null
  created_at: string
  favorited: boolean
  full_text: string,
  truncated?: boolean
}

export interface Follower {
  accountId: string
  userLink: string
}

export interface Following {
  accountId: string
  userLink: string
}

export interface CommunityTweet {
  id: string
  source: string
  entities: Record<string, any>
  favorite_count: number
  id_str: string
  retweet_count: number | null
  created_at: string
  favorited: boolean
  full_text: string
}

export interface Like {
  tweetId: string
  fullText: string
}

export interface NoteTweetLifecycle {
  value: string
  name: string
  originalName: string
  annotations: Record<string, any>
}

export interface NoteTweetCore {
  styletags: string[]
  urls: string[]
  text: string
  mentions: string[]
  cashtags: string[]
  hashtags: string[]
}

export interface NoteTweet {
  noteTweetId: string
  updatedAt: string
  lifecycle: NoteTweetLifecycle
  createdAt: string
  core: NoteTweetCore
}

// Define the Archive type
export interface Archive {
  profile: { profile: Profile }[]
  account: { account: Account }[]
  tweets: { tweet: Tweet }[]
  follower: { follower: Follower }[]
  following: { following: Following }[]
  'community-tweet': { tweet: CommunityTweet }[]
  like: { like: Like }[]
  'note-tweet'?: { noteTweet: NoteTweet }[] // Optional as it's an optional file
  'upload-options'?: UploadOptions // Add this line
}

// Update the existing ArchiveStats to align with the new types if necessary
export type ArchiveStats = {
  username: string
  accountDisplayName: string
  tweetCount: number
  likesCount: number
  followerCount: number
  earliestTweetDate: string
  latestTweetDate: string
  avatarMediaUrl: string
}

export type FileUploadDialogProps = {
  supabase: SupabaseClient<Database>
  isOpen: boolean
  onClose: () => void
  archive: Archive
}

export type UploadOptions = {
  keepPrivate: boolean
  uploadLikes: boolean
  startDate: Date
  endDate: Date
}

export type AvatarType = {
  account_id: string
  username: string
  avatar_media_url: string
  num_tweets?: number
  num_followers?: number
}

export type ArchiveUpload = {
  archive_at: string
}

export type SearchParams = {
  search_query: string
  from_user: string | null
  to_user: string | null
  since_date: string | null
  until_date: string | null
}

export type PopularTweet = {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  archive_upload_id: number
  num_likes?: number
  num_replies?: number
}

export type DirectoryUser = {
  directory_id: string
  account_id: string | null
  username: string
  account_display_name: string
  avatar_media_url: string | null
  num_followers: number | null
  has_archive: boolean
  is_opted_in: boolean
  opted_in_at: string | null
  archive_uploaded_at: string | null
  joined_at: string | null
}

export type SortKey =
  | 'username'
  | 'account_display_name'
  | 'num_followers'
  | 'joined_at'

export type FormattedUser = {
  account_id: string | null
  username: string
  account_display_name: string
  created_at: string | null
  bio: string | null
  website: string | null
  location: string | null
  avatar_media_url: string | null
  header_media_url?: string | null
  archive_at: string | null
  num_tweets: number | null
  num_followers: number | null
  num_following: number | null
  num_likes: number | null
  archive_uploaded_at: string | null
  joined_at: string | null
  has_archive: boolean
  is_opted_in: boolean
}

// Interfaces for fetching and displaying tweets via Supabase queries
export interface RawSupabaseProfile {
  avatar_media_url: string | null;
}

export interface RawSupabaseAccount {
  username: string;
  account_display_name: string;
  profile: RawSupabaseProfile | null;
}

export interface RawSupabaseTweet {
  tweet_id: string;
  created_at: string;
  full_text: string;
  favorite_count: number;
  retweet_count: number | null;
  reply_to_tweet_id: string | null;
  account: RawSupabaseAccount; 
  media?: Array<{
    media_url: string;
    media_type: string;
    width?: number;
    height?: number;
  }>;
}

export interface TimelineTweet {
  tweet_id: string;
  created_at: string;
  full_text: string;
  favorite_count: number;
  retweet_count: number | null;
  reply_to_tweet_id: string | null;
  account: { 
    username: string;
    account_display_name: string;
    profile?: { 
      avatar_media_url?: string;
    };
  };
  media?: Array<TweetMediaItem>;
}

export interface TweetMediaItem {
  media_url: string;
  media_type: string;
  width?: number;
  height?: number;
}
