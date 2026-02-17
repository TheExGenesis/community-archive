import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { ConversationTree, ThreadTweet, buildConversationTree } from './threadUtils'
import { TweetData } from '@/components/TweetComponent'

interface RpcTweet {
  tweet_id: string
  account_id: string
  username: string
  account_display_name: string
  created_at: string
  full_text: string
  retweet_count: number
  favorite_count: number
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  quoted_tweet_id: string | null
  conversation_id: string | null
  avatar_media_url: string | null
  archive_upload_id: number | null
}

interface RpcMedia {
  media_url: string
  media_type: string
  width: number | null
  height: number | null
  tweet_id: string
}

interface RpcMentionedUser {
  tweet_id: string
  user_id: string
  name: string
  screen_name: string
  account_id: string | null
  account_username: string | null
  account_display_name: string | null
  avatar_media_url: string | null
}

interface RpcQuotedTweet {
  tweet_id: string
  source_tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number
  favorite_count: number
  username: string
  account_display_name: string
  avatar_media_url: string | null
  media: RpcMedia[]
}

interface RpcResult {
  tweet: RpcTweet | null
  media: RpcMedia[]
  mentioned_users: RpcMentionedUser[]
  conversation_tweets: RpcTweet[]
  conversation_media: RpcMedia[]
  quoted_tweets: RpcQuotedTweet[]
}

interface TweetPageResult {
  tweet: TweetData | null
  threadTree: ConversationTree | null
}

/**
 * Fetch all data needed for the tweet page in a single RPC call.
 * Replaces ~24 separate Supabase HTTP calls with 1.
 */
export async function getTweetPageData(tweetId: string): Promise<TweetPageResult> {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const { data, error } = await supabase.rpc('get_tweet_page_data' as any, {
    p_tweet_id: tweetId,
  })

  if (error || !data) {
    console.error('get_tweet_page_data RPC failed:', error?.message, { tweetId })
    return { tweet: null, threadTree: null }
  }

  const result = data as unknown as RpcResult

  if (!result.tweet) {
    return { tweet: null, threadTree: null }
  }

  // Build the main tweet in TweetData format
  const mainTweet = buildTweetData(result.tweet, result.media, result.mentioned_users, result.quoted_tweets)

  // Build conversation tree
  const threadTree = buildThreadTree(
    result.tweet,
    result.conversation_tweets,
    result.conversation_media,
    result.quoted_tweets,
  )

  return { tweet: mainTweet, threadTree }
}

function buildTweetData(
  tweet: RpcTweet,
  media: RpcMedia[],
  mentionedUsers: RpcMentionedUser[],
  quotedTweets: RpcQuotedTweet[],
): TweetData {
  const tweetMedia = media.map((m) => ({
    media_url: m.media_url,
    media_type: m.media_type,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
  }))

  // Find the quoted tweet for this tweet
  const quotedTweet = quotedTweets.find((qt) => qt.source_tweet_id === tweet.tweet_id)

  // Build mentioned_users in the shape TweetComponent expects
  const mentions = mentionedUsers
    .filter((mu) => mu.tweet_id === tweet.tweet_id)
    .map((mu) => ({
      mentioned_user: {
        user_id: mu.user_id,
        name: mu.name,
        screen_name: mu.screen_name,
        account: mu.account_id
          ? {
              username: mu.account_username || mu.screen_name,
              account_display_name: mu.account_display_name || mu.name,
              profile: mu.avatar_media_url
                ? { avatar_media_url: mu.avatar_media_url }
                : undefined,
            }
          : undefined,
      },
    }))

  return {
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    retweet_count: tweet.retweet_count,
    favorite_count: tweet.favorite_count,
    reply_to_tweet_id: tweet.reply_to_tweet_id,
    reply_to_username: tweet.reply_to_username ?? undefined,
    quote_tweet_id: tweet.quoted_tweet_id,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.avatar_media_url,
    username: tweet.username,
    account_display_name: tweet.account_display_name,
    media: tweetMedia,
    urls: [],
    mentioned_users: mentions,
    account: {
      username: tweet.username,
      account_display_name: tweet.account_display_name,
      profile: tweet.avatar_media_url
        ? { avatar_media_url: tweet.avatar_media_url }
        : undefined,
    },
    quoted_tweet: quotedTweet
      ? {
          tweet_id: quotedTweet.tweet_id,
          account_id: quotedTweet.account_id,
          created_at: quotedTweet.created_at,
          full_text: quotedTweet.full_text,
          retweet_count: quotedTweet.retweet_count,
          favorite_count: quotedTweet.favorite_count,
          avatar_media_url: quotedTweet.avatar_media_url ?? undefined,
          username: quotedTweet.username,
          account_display_name: quotedTweet.account_display_name,
          media: quotedTweet.media?.map((m) => ({
            media_url: m.media_url,
            media_type: m.media_type,
            width: m.width ?? undefined,
            height: m.height ?? undefined,
          })),
        }
      : undefined,
  }
}

function buildThreadTree(
  mainTweet: RpcTweet,
  conversationTweets: RpcTweet[],
  conversationMedia: RpcMedia[],
  quotedTweets: RpcQuotedTweet[],
): ConversationTree | null {
  if (conversationTweets.length <= 1) {
    return null
  }

  const threadTweets: ThreadTweet[] = conversationTweets.map((ct) => {
    const media = conversationMedia
      .filter((m) => m.tweet_id === ct.tweet_id)
      .map((m) => ({
        media_url: m.media_url,
        media_type: m.media_type,
        width: m.width,
        height: m.height,
      }))

    const quotedTweet = quotedTweets.find((qt) => qt.source_tweet_id === ct.tweet_id)

    return {
      tweet_id: ct.tweet_id,
      account_id: ct.account_id,
      created_at: ct.created_at,
      full_text: ct.full_text,
      retweet_count: ct.retweet_count,
      favorite_count: ct.favorite_count,
      reply_to_tweet_id: ct.reply_to_tweet_id,
      reply_to_user_id: ct.reply_to_user_id,
      reply_to_username: ct.reply_to_username,
      username: ct.username,
      account_display_name: ct.account_display_name,
      avatar_media_url: ct.avatar_media_url ?? undefined,
      media,
      quote_tweet_id: quotedTweet ? quotedTweet.tweet_id : null,
      quoted_tweet: quotedTweet
        ? {
            tweet_id: quotedTweet.tweet_id,
            account_id: quotedTweet.account_id,
            created_at: quotedTweet.created_at,
            full_text: quotedTweet.full_text,
            retweet_count: quotedTweet.retweet_count,
            favorite_count: quotedTweet.favorite_count,
            avatar_media_url: quotedTweet.avatar_media_url ?? undefined,
            username: quotedTweet.username,
            account_display_name: quotedTweet.account_display_name,
            media: quotedTweet.media?.map((m) => ({
              media_url: m.media_url,
              media_type: m.media_type,
              width: m.width,
              height: m.height,
            })),
          }
        : null,
    }
  })

  return buildConversationTree(threadTweets)
}
