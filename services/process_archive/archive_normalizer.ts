export type TextId = string | number

export interface AccountRow {
  account_id: TextId
  created_via: string
  username: string
  created_at: string
  account_display_name: string
  num_tweets: number
  num_following: number
  num_followers: number
  num_likes: number
}

export interface ProfileRow {
  account_id: TextId
  avatar_media_url: string | null
  header_media_url: string | null
  bio: string | null
  location: string | null
  website: string | null
  archive_upload_id: number
}

export interface TweetRow {
  tweet_id: TextId
  account_id: TextId
  created_at: string
  full_text: string
  favorite_count: number
  retweet_count: number
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  archive_upload_id: number
}

export interface MentionedUserRow {
  user_id: TextId
  name: string
  screen_name: string
}

export interface UserMentionRow {
  tweet_id: TextId
  mentioned_user_id: TextId
}

export interface TweetUrlRow {
  tweet_id: TextId
  url: string
  expanded_url: string
  display_url: string
}

export interface TweetMediaRow {
  tweet_id: TextId
  media_id: TextId
  media_url: string
  media_type: string
  width: number
  height: number
  archive_upload_id: number
}

export interface QuoteTweetRow {
  tweet_id: TextId
  quoted_tweet_id: string
}

export interface RetweetRow {
  tweet_id: TextId
  retweeted_tweet_id: null
}

export interface LikedTweetRow {
  tweet_id: TextId
  full_text: string
}

export interface LikeRow {
  account_id: TextId
  liked_tweet_id: TextId
  archive_upload_id: number
}

export interface FollowingRow {
  account_id: TextId
  following_account_id: TextId
  archive_upload_id: number
}

export interface FollowerRow {
  account_id: TextId
  follower_account_id: TextId
  archive_upload_id: number
}

export interface NormalizedUserRows {
  accounts: AccountRow[]
  profiles: ProfileRow[]
}

export interface NormalizedTweetRows {
  tweets: TweetRow[]
  mentionedUsers: MentionedUserRow[]
  userMentions: UserMentionRow[]
  tweetUrls: TweetUrlRow[]
  tweetMedia: TweetMediaRow[]
  quoteTweets: QuoteTweetRow[]
  retweets: RetweetRow[]
}

export interface NormalizedRemainingRows {
  likedTweets: LikedTweetRow[]
  likes: LikeRow[]
  following: FollowingRow[]
  followers: FollowerRow[]
}

export function removeProblematicCharacters(
  value: string | null | undefined,
): string | null {
  if (!value || value === 'NULL') return null
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
}

export function dedupeByConflict<T extends Record<string, unknown>>(
  items: T[],
  conflict: string | string[] | null,
): T[] {
  if (!items.length || !conflict) return items

  const keys = Array.isArray(conflict) ? conflict : [conflict]
  const uniqueItems = new Map<string, T>()

  for (const item of items) {
    const key = keys.map((column) => `${item[column] ?? ''}`).join('||')
    if (!uniqueItems.has(key)) uniqueItems.set(key, item)
  }

  return Array.from(uniqueItems.values())
}

export function normalizeUserRows(
  archive: any,
  archiveUploadId: number,
): NormalizedUserRows {
  const account = archive.account?.[0]?.account
  const profile = archive.profile?.[0]?.profile

  return {
    accounts: account
      ? [
          {
            account_id: account.accountId,
            created_via: account.createdVia || 'twitter_archive',
            username: account.username,
            created_at: account.createdAt,
            account_display_name: account.accountDisplayName,
            num_tweets: archive.tweets?.length || 0,
            num_following: archive.following?.length || 0,
            num_followers: archive.follower?.length || 0,
            num_likes: archive.like?.length || 0,
          },
        ]
      : [],
    profiles:
      profile && account
        ? [
            {
              account_id: account.accountId,
              avatar_media_url: removeProblematicCharacters(
                profile.avatarMediaUrl,
              ),
              header_media_url: removeProblematicCharacters(
                profile.headerMediaUrl,
              ),
              bio: profile.description?.bio || null,
              location: profile.description?.location || null,
              website: profile.description?.website || null,
              archive_upload_id: archiveUploadId,
            },
          ]
        : [],
  }
}

export function normalizeTweetRows(
  tweetChunk: any[],
  account: any,
  archiveUploadId: number,
): NormalizedTweetRows {
  const rows: NormalizedTweetRows = {
    tweets: [],
    mentionedUsers: [],
    userMentions: [],
    tweetUrls: [],
    tweetMedia: [],
    quoteTweets: [],
    retweets: [],
  }
  if (!account) return rows

  const mentionedUsers = new Map<TextId, MentionedUserRow>()

  for (const tweetData of tweetChunk) {
    const tweet = tweetData.tweet
    const tweetId = tweet.id_str || tweet.id

    rows.tweets.push({
      tweet_id: tweetId,
      account_id: account.accountId,
      created_at: tweet.created_at,
      full_text: removeProblematicCharacters(tweet.full_text) || '',
      favorite_count: tweet.favorite_count || 0,
      retweet_count: tweet.retweet_count || 0,
      reply_to_tweet_id: removeProblematicCharacters(
        tweet.in_reply_to_status_id_str,
      ),
      reply_to_user_id: removeProblematicCharacters(
        tweet.in_reply_to_user_id_str,
      ),
      reply_to_username: removeProblematicCharacters(
        tweet.in_reply_to_screen_name,
      ),
      archive_upload_id: archiveUploadId,
    })

    for (const mention of tweet.entities?.user_mentions || []) {
      const userId = mention.id_str
      if (!mentionedUsers.has(userId)) {
        mentionedUsers.set(userId, {
          user_id: userId,
          name: removeProblematicCharacters(mention.name) || '',
          screen_name: removeProblematicCharacters(mention.screen_name) || '',
        })
      }
      rows.userMentions.push({
        tweet_id: tweetId,
        mentioned_user_id: userId,
      })
    }

    for (const url of tweet.entities?.urls || []) {
      rows.tweetUrls.push({
        tweet_id: tweetId,
        url: url.url,
        expanded_url: url.expanded_url || '',
        display_url: url.display_url || '',
      })

      const isQuoteTweet =
        (url.expanded_url?.includes('twitter.com/') ||
          url.expanded_url?.includes('x.com/')) &&
        url.expanded_url?.includes('/status/')
      if (isQuoteTweet) {
        const quotedTweetId = url.expanded_url?.split('/status/')[1]
        if (quotedTweetId) {
          rows.quoteTweets.push({
            tweet_id: tweetId,
            quoted_tweet_id: quotedTweetId,
          })
        }
      }
    }

    for (const media of tweet.entities?.media || []) {
      rows.tweetMedia.push({
        tweet_id: tweetId,
        media_id: media.id_str,
        media_url: media.media_url_https || media.media_url,
        media_type: media.type,
        width: media.sizes?.large?.w || 0,
        height: media.sizes?.large?.h || 0,
        archive_upload_id: archiveUploadId,
      })
    }

    if (tweet.full_text?.match(/^RT @\w+: /)) {
      rows.retweets.push({ tweet_id: tweetId, retweeted_tweet_id: null })
    }
  }

  rows.mentionedUsers = Array.from(mentionedUsers.values())
  rows.tweetUrls = dedupeByConflict(rows.tweetUrls, ['tweet_id', 'url'])
  rows.tweetMedia = dedupeByConflict(rows.tweetMedia, 'media_id')
  return rows
}

export function normalizeRemainingRows(
  archive: any,
  archiveUploadId: number,
): NormalizedRemainingRows {
  const account = archive.account?.[0]?.account
  if (!account) {
    return { likedTweets: [], likes: [], following: [], followers: [] }
  }

  return {
    likedTweets: (archive.like || []).map((like: any) => ({
      tweet_id: like.like.tweetId,
      full_text: like.like.fullText || '',
    })),
    likes: (archive.like || []).map((like: any) => ({
      account_id: account.accountId,
      liked_tweet_id: like.like.tweetId,
      archive_upload_id: archiveUploadId,
    })),
    following: (archive.following || []).map((follow: any) => ({
      account_id: account.accountId,
      following_account_id: follow.following.accountId,
      archive_upload_id: archiveUploadId,
    })),
    followers: (archive.follower || []).map((follower: any) => ({
      account_id: account.accountId,
      follower_account_id: follower.follower.accountId,
      archive_upload_id: archiveUploadId,
    })),
  }
}
