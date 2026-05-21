import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { ConversationTree, ThreadTweet, buildConversationTree } from './threadUtils'
import { TweetData } from '@/components/TweetComponent'
import {
  fetchSyndicatedTweets,
  type SyndicatedTweet,
} from './twitterSyndication'

interface RpcTweet {
  tweet_id: string
  account_id: string
  username: string
  account_display_name: string
  created_at: string
  full_text: string
  retweet_count: number | null
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
  retweet_count: number | null
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

  // Collect every tweet id referenced by the conversation that the RPC couldn't
  // return — these are reply targets and quoted tweets that have been deleted from
  // our archive. Try Twitter's syndication endpoint to hydrate them so the thread
  // view shows real content instead of a tombstone when the original tweet still
  // exists on Twitter. Results are NOT persisted and NOT used in search.
  const presentIds = new Set<string>(
    result.conversation_tweets.map((ct) => ct.tweet_id),
  )
  const presentQuotedSources = new Set<string>(
    result.quoted_tweets.map((qt) => qt.source_tweet_id),
  )
  const missingIds = new Set<string>()

  // Missing reply parents in the conversation
  for (const ct of result.conversation_tweets) {
    if (ct.reply_to_tweet_id && !presentIds.has(ct.reply_to_tweet_id)) {
      missingIds.add(ct.reply_to_tweet_id)
    }
  }
  // Missing quoted tweets (the RPC INNER JOINs enriched_tweets so deleted targets
  // are absent from `quoted_tweets`; enriched_tweets.quoted_tweet_id still has the id)
  if (
    result.tweet.quoted_tweet_id &&
    !presentQuotedSources.has(result.tweet.tweet_id)
  ) {
    missingIds.add(result.tweet.quoted_tweet_id)
  }
  for (const ct of result.conversation_tweets) {
    if (ct.quoted_tweet_id && !presentQuotedSources.has(ct.tweet_id)) {
      missingIds.add(ct.quoted_tweet_id)
    }
  }

  const syndicated =
    missingIds.size > 0
      ? await fetchSyndicatedTweets(Array.from(missingIds))
      : new Map<string, SyndicatedTweet | null>()

  // Build the main tweet
  const mainTweet = buildTweetData(
    result.tweet,
    result.media,
    result.mentioned_users,
    result.quoted_tweets,
    syndicated,
  )

  // Build conversation tree, injecting hydrated tweets as ThreadTweets so they end
  // up in their natural position instead of becoming placeholders.
  const threadTree = buildThreadTree(
    result.tweet,
    result.conversation_tweets,
    result.conversation_media,
    result.quoted_tweets,
    syndicated,
  )

  return { tweet: mainTweet, threadTree }
}

// Convert a SyndicatedTweet into the quoted-tweet shape both ThreadTweet and TweetData
// expect. Includes `from_external` so the renderer can mark it visually.
function syndicatedToQuotedTweet(s: SyndicatedTweet) {
  return {
    tweet_id: s.tweet_id,
    account_id: s.account_id,
    created_at: s.created_at,
    full_text: s.full_text,
    retweet_count: s.retweet_count,
    favorite_count: s.favorite_count,
    avatar_media_url: s.avatar_media_url,
    username: s.username,
    account_display_name: s.account_display_name,
    media: s.media,
    from_external: true as const,
  }
}

// Convert a SyndicatedTweet into a ThreadTweet for insertion into the conversation.
function syndicatedToThreadTweet(s: SyndicatedTweet): ThreadTweet {
  return {
    tweet_id: s.tweet_id,
    account_id: s.account_id,
    created_at: s.created_at,
    full_text: s.full_text,
    retweet_count: s.retweet_count,
    favorite_count: s.favorite_count,
    reply_to_tweet_id: s.reply_to_tweet_id,
    reply_to_user_id: s.reply_to_user_id,
    reply_to_username: s.reply_to_username,
    username: s.username,
    account_display_name: s.account_display_name,
    avatar_media_url: s.avatar_media_url,
    media: s.media,
    quote_tweet_id: null,
    quoted_tweet: null,
    from_external: true,
  }
}

function buildTweetData(
  tweet: RpcTweet,
  media: RpcMedia[],
  mentionedUsers: RpcMentionedUser[],
  quotedTweets: RpcQuotedTweet[],
  syndicated: Map<string, SyndicatedTweet | null>,
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
      : tweet.quoted_tweet_id
        ? // The RPC didn't include the quoted tweet (deleted from our archive). Prefer
          // a syndication hydration if Twitter still has it; fall back to tombstone.
          syndicated.get(tweet.quoted_tweet_id)
          ? syndicatedToQuotedTweet(syndicated.get(tweet.quoted_tweet_id)!)
          : {
              tweet_id: tweet.quoted_tweet_id,
              account_id: '',
              created_at: '',
              full_text: '',
              retweet_count: 0,
              favorite_count: 0,
              avatar_media_url: undefined,
              username: '',
              account_display_name: '',
              is_deleted: true,
            }
        : undefined,
  }
}

function buildThreadTree(
  mainTweet: RpcTweet,
  conversationTweets: RpcTweet[],
  conversationMedia: RpcMedia[],
  quotedTweets: RpcQuotedTweet[],
  syndicated: Map<string, SyndicatedTweet | null>,
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
      // ct.quoted_tweet_id is sourced from enriched_tweets and survives even if the
      // quoted tweet itself was deleted; the RPC's quoted_tweets list won't contain it
      // in that case. Preserve the relationship and surface a placeholder.
      quote_tweet_id: ct.quoted_tweet_id ?? (quotedTweet ? quotedTweet.tweet_id : null),
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
        : ct.quoted_tweet_id
          ? // Quote target deleted from our archive — try syndication first, then
            // fall back to a tombstone placeholder.
            syndicated.get(ct.quoted_tweet_id)
            ? syndicatedToQuotedTweet(syndicated.get(ct.quoted_tweet_id)!)
            : {
                tweet_id: ct.quoted_tweet_id,
                account_id: '',
                created_at: '',
                full_text: '',
                retweet_count: 0,
                favorite_count: 0,
                username: '',
                account_display_name: '',
                is_deleted: true,
              }
          : null,
    }
  })

  // For any reply target the RPC couldn't supply, inject the hydrated syndication
  // result as a real ThreadTweet so it slots into its natural position in the tree
  // (rather than appearing as a tombstone via buildConversationTree's placeholder).
  const presentIds = new Set(threadTweets.map((t) => t.tweet_id))
  for (const ct of conversationTweets) {
    const parentId = ct.reply_to_tweet_id
    if (!parentId || presentIds.has(parentId)) continue
    const hydrated = syndicated.get(parentId)
    if (hydrated) {
      threadTweets.push(syndicatedToThreadTweet(hydrated))
      presentIds.add(parentId)
    }
  }

  return buildConversationTree(threadTweets)
}
