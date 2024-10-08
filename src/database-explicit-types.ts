
import { Tables, TablesInsert, TablesUpdate } from './database-types'

// Account
export type Account = Tables<'account'>
export type InsertAccount = TablesInsert<'account'>
export type UpdateAccount = TablesUpdate<'account'>

// Archive Upload
export type ArchiveUpload = Tables<'archive_upload'>
export type InsertArchiveUpload = TablesInsert<'archive_upload'>
export type UpdateArchiveUpload = TablesUpdate<'archive_upload'>

// Followers
export type Followers = Tables<'followers'>
export type InsertFollowers = TablesInsert<'followers'>
export type UpdateFollowers = TablesUpdate<'followers'>

// Following
export type Following = Tables<'following'>
export type InsertFollowing = TablesInsert<'following'>
export type UpdateFollowing = TablesUpdate<'following'>

// Liked Tweets
export type LikedTweets = Tables<'liked_tweets'>
export type InsertLikedTweets = TablesInsert<'liked_tweets'>
export type UpdateLikedTweets = TablesUpdate<'liked_tweets'>

// Likes
export type Likes = Tables<'likes'>
export type InsertLikes = TablesInsert<'likes'>
export type UpdateLikes = TablesUpdate<'likes'>

// Mentioned Users
export type MentionedUsers = Tables<'mentioned_users'>
export type InsertMentionedUsers = TablesInsert<'mentioned_users'>
export type UpdateMentionedUsers = TablesUpdate<'mentioned_users'>

// Profile
export type Profile = Tables<'profile'>
export type InsertProfile = TablesInsert<'profile'>
export type UpdateProfile = TablesUpdate<'profile'>

// Tweet Media
export type TweetMedia = Tables<'tweet_media'>
export type InsertTweetMedia = TablesInsert<'tweet_media'>
export type UpdateTweetMedia = TablesUpdate<'tweet_media'>

// Tweet URLs
export type TweetURLs = Tables<'tweet_urls'>
export type InsertTweetURLs = TablesInsert<'tweet_urls'>
export type UpdateTweetURLs = TablesUpdate<'tweet_urls'>

// Tweets
export type Tweets = Tables<'tweets'>
export type InsertTweets = TablesInsert<'tweets'>
export type UpdateTweets = TablesUpdate<'tweets'>

// User Mentions
export type UserMentions = Tables<'user_mentions'>
export type InsertUserMentions = TablesInsert<'user_mentions'>
export type UpdateUserMentions = TablesUpdate<'user_mentions'>