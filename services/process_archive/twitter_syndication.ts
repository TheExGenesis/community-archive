const SYNDICATION_BASE = 'https://cdn.syndication.twimg.com/tweet-result'
const TWITTER_ID = /^\d{1,20}$/

export interface SyndicatedMediaForIngestion {
  media_id: string
  media_url: string
  media_type: string
  width: number | null
  height: number | null
}

export interface SyndicatedUrlForIngestion {
  url: string
  expanded_url: string
  display_url: string
}

export interface SyndicatedMentionForIngestion {
  user_id: string
  name: string
  screen_name: string
}

export interface SyndicatedTweetForIngestion {
  tweet_id: string
  account_id: string
  username: string
  account_display_name: string
  account_created_at: string | null
  created_at: string
  full_text: string
  favorite_count: number
  retweet_count: null
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  avatar_media_url: string | null
  header_media_url: string | null
  bio: string | null
  location: string | null
  website: string | null
  media: SyndicatedMediaForIngestion[]
  urls: SyndicatedUrlForIngestion[]
  mentions: SyndicatedMentionForIngestion[]
}

export interface SyndicatedConversationRecovery {
  rootTweetId: string
  tweets: SyndicatedTweetForIngestion[]
}

export type SyndicatedTweetFetcher = (
  tweetId: string,
) => Promise<SyndicatedTweetForIngestion | null>

export function computeSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '')
}

function numericId(value: unknown): string | null {
  const id = typeof value === 'string' ? value : ''
  return TWITTER_ID.test(id) ? id : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function dateString(value: unknown): string | null {
  const date = nullableString(value)
  return date && !Number.isNaN(Date.parse(date)) ? date : null
}

function mediaIdFromUrl(mediaUrl: string): string | null {
  try {
    const filename = new URL(mediaUrl).pathname.split('/').pop() ?? ''
    const encoded = filename.split('.', 1)[0]
    const bytes = Buffer.from(encoded, 'base64url')
    return bytes.length >= 8 ? bytes.readBigUInt64BE(0).toString() : null
  } catch {
    return null
  }
}

export function normalizeSyndicatedTweet(
  requestedTweetId: string,
  data: any,
): SyndicatedTweetForIngestion | null {
  if (!TWITTER_ID.test(requestedTweetId)) return null
  if (!data || data.__typename === 'TweetTombstone') return null

  // Syndication can silently redirect retweet IDs to the original tweet. That
  // response cannot establish the requested tweet's place in a reply chain.
  if (numericId(data.id_str) !== requestedTweetId) return null

  const accountId = numericId(data.user?.id_str)
  const username = nullableString(data.user?.screen_name)
  const displayName = nullableString(data.user?.name)
  const createdAt = dateString(data.created_at)
  const fullText = nullableString(data.text)
  if (!accountId || !username || !displayName || !createdAt || !fullText) {
    return null
  }

  const parentId =
    numericId(data.in_reply_to_status_id_str) ?? numericId(data.parent?.id_str)

  const media = Array.isArray(data.mediaDetails)
    ? data.mediaDetails.flatMap((item: any) => {
        const mediaUrl = nullableString(
          item?.media_url_https ?? item?.media_url,
        )
        const mediaId =
          numericId(item?.id_str ?? item?.id) ??
          (mediaUrl ? mediaIdFromUrl(mediaUrl) : null)
        if (!mediaId || !mediaUrl) return []
        return [
          {
            media_id: mediaId,
            media_url: mediaUrl,
            media_type: nullableString(item?.type) ?? 'photo',
            width:
              typeof item?.original_info?.width === 'number'
                ? item.original_info.width
                : null,
            height:
              typeof item?.original_info?.height === 'number'
                ? item.original_info.height
                : null,
          },
        ]
      })
    : []

  const urls = Array.isArray(data.entities?.urls)
    ? data.entities.urls.flatMap((item: any) => {
        const url = nullableString(item?.url)
        if (!url) return []
        return [
          {
            url,
            expanded_url: nullableString(item?.expanded_url) ?? '',
            display_url: nullableString(item?.display_url) ?? '',
          },
        ]
      })
    : []

  const mentions = Array.isArray(data.entities?.user_mentions)
    ? data.entities.user_mentions.flatMap((item: any) => {
        const userId = numericId(item?.id_str)
        if (!userId) return []
        return [
          {
            user_id: userId,
            name: nullableString(item?.name) ?? '',
            screen_name: nullableString(item?.screen_name) ?? '',
          },
        ]
      })
    : []

  const website = nullableString(
    data.user?.entities?.url?.urls?.[0]?.expanded_url,
  )

  return {
    tweet_id: requestedTweetId,
    account_id: accountId,
    username,
    account_display_name: displayName,
    account_created_at: dateString(data.user?.created_at),
    created_at: createdAt,
    full_text: fullText,
    favorite_count:
      typeof data.favorite_count === 'number' ? data.favorite_count : 0,
    // The endpoint does not expose a retweet count. conversation_count is not
    // an equivalent metric and must not be substituted.
    retweet_count: null,
    reply_to_tweet_id: parentId,
    reply_to_user_id:
      numericId(data.in_reply_to_user_id_str) ??
      numericId(data.parent?.user?.id_str),
    reply_to_username:
      nullableString(data.in_reply_to_screen_name) ??
      nullableString(data.parent?.user?.screen_name),
    avatar_media_url: nullableString(data.user?.profile_image_url_https),
    header_media_url: nullableString(data.user?.profile_banner_url),
    bio: nullableString(data.user?.description),
    location: nullableString(data.user?.location),
    website,
    media,
    urls,
    mentions,
  }
}

export async function fetchSyndicatedTweetForIngestion(
  tweetId: string,
  {
    fetchImpl = fetch,
    timeoutMs = 5_000,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SyndicatedTweetForIngestion | null> {
  if (!TWITTER_ID.test(tweetId)) return null

  const url = new URL(SYNDICATION_BASE)
  url.searchParams.set('id', tweetId)
  url.searchParams.set('token', computeSyndicationToken(tweetId))
  url.searchParams.set('lang', 'en')

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (community-archive ingestion)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return normalizeSyndicatedTweet(tweetId, await response.json())
  } catch {
    return null
  }
}

export async function recoverSyndicatedConversation(
  startTweetId: string,
  fetchTweet: SyndicatedTweetFetcher = fetchSyndicatedTweetForIngestion,
  maxDepth = 64,
): Promise<SyndicatedConversationRecovery | null> {
  if (!TWITTER_ID.test(startTweetId) || maxDepth < 1) return null

  const visited = new Set<string>()
  const tweets: SyndicatedTweetForIngestion[] = []
  let currentId: string | null = startTweetId

  while (currentId && tweets.length < maxDepth) {
    if (visited.has(currentId)) return null
    visited.add(currentId)

    const tweet = await fetchTweet(currentId)
    if (!tweet || tweet.tweet_id !== currentId) return null
    tweets.push(tweet)

    if (!tweet.reply_to_tweet_id) {
      return { rootTweetId: tweet.tweet_id, tweets }
    }
    currentId = tweet.reply_to_tweet_id
  }

  // Hitting the bound before a root is an incomplete traversal, not evidence
  // that the last fetched tweet is the original post.
  return null
}
