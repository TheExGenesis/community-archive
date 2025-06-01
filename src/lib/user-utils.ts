import { FormattedUser } from './types'

export function formatUserData(data: any): FormattedUser {
  const getLatestValue = (arr: any[] | null | undefined, key: string) =>
    Array.isArray(arr) ? arr[arr.length - 1]?.[key] : arr?.[key]

  return {
    account_id: data.account_id,
    username: data.username,
    account_display_name: data.account_display_name,
    created_at: data.created_at,
    bio: getLatestValue(data.profile, 'bio'),
    website: getLatestValue(data.profile, 'website'),
    location: getLatestValue(data.profile, 'location'),
    avatar_media_url: getLatestValue(data.profile, 'avatar_media_url'),
    header_media_url: getLatestValue(data.profile, 'header_media_url'),
    archive_at: getLatestValue(data.archive_upload, 'archive_at'),
    num_tweets: data.num_tweets,
    num_followers: data.num_followers,
    num_following: data.num_following,
    num_likes: data.num_likes,
    archive_uploaded_at: getLatestValue(data.archive_upload, 'created_at'),
  }
}
