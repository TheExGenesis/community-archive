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
  retweet_count: number
  created_at: string
  favorited: boolean
  full_text: string
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
  retweet_count: number
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
}

export type ArchiveUpload = {
  archive_at: string
}
