/**
 * Twitter syndication API client for transient render-time hydration of tweets that
 * have been deleted from our archive but may still be accessible via Twitter's public
 * embed CDN. Used to fill in deleted reply parents and deleted quoted tweets, and
 * to recover an avatar transiently when an archived profile image is missing or
 * stale.
 *
 * Hard rules:
 * - Never persist the response to our DB.
 * - Never include hydrated tweet content in search results, profile listings, or any
 *   other query path. Avatar recovery is render-only and is never persisted.
 * - Caller decides whether to render with a "(from Twitter)" marker.
 *
 * The endpoint requires a `token` query param derived from the tweet id. This is
 * the same derivation used by Vercel's `react-tweet`:
 *   token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
 */

const SYNDICATION_BASE = 'https://cdn.syndication.twimg.com/tweet-result'

const computeToken = (id: string): string =>
  ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '')

export interface SyndicatedMedia {
  media_url: string
  media_type: string
  width?: number
  height?: number
}

export interface SyndicatedTweet {
  tweet_id: string
  account_id: string
  username: string
  account_display_name: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  avatar_media_url?: string
  media?: SyndicatedMedia[]
  reply_to_tweet_id: string | null
  reply_to_username: string | null
  reply_to_user_id: string | null
  // Identifies hydrated-from-Twitter tweets in renderers so they can be marked
  // visibly as "not in the archive".
  from_external: true
}

/**
 * Fetch a single tweet via Twitter's public syndication endpoint and normalize it
 * to our ThreadTweet-compatible shape. Returns null when:
 * - the id isn't a valid Twitter-snowflake-shaped numeric string (e.g. staging mock
 *   ids like "t_xiq_2") — saves a guaranteed-failing roundtrip
 * - the endpoint responds with a non-2xx
 * - the response is a TweetTombstone (Twitter also lost the tweet)
 * - JSON shape isn't what we expect
 *
 * Relies on Next.js's `fetch` cache (1h revalidate) — multiple page requests for
 * the same tweet within an hour don't re-hit Twitter.
 */
export async function fetchSyndicatedTweet(
  tweetId: string,
): Promise<SyndicatedTweet | null> {
  if (!/^\d{5,}$/.test(tweetId)) return null

  const url = new URL(SYNDICATION_BASE)
  url.searchParams.set('id', tweetId)
  url.searchParams.set('token', computeToken(tweetId))
  url.searchParams.set('lang', 'en')

  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (community-archive hydration)' },
      next: { revalidate: 3600 },
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  let data: any
  try {
    data = await response.json()
  } catch {
    return null
  }

  if (!data || data.__typename === 'TweetTombstone' || !data.id_str) {
    return null
  }

  const media: SyndicatedMedia[] = Array.isArray(data.mediaDetails)
    ? data.mediaDetails.map((m: any) => ({
        media_url: m.media_url_https ?? m.media_url ?? '',
        media_type: m.type ?? 'photo',
        width: m.original_info?.width,
        height: m.original_info?.height,
      }))
    : []

  return {
    tweet_id: data.id_str,
    account_id: data.user?.id_str ?? '',
    username: data.user?.screen_name ?? '',
    account_display_name: data.user?.name ?? '',
    created_at: data.created_at ?? '',
    full_text: data.text ?? '',
    retweet_count:
      typeof data.conversation_count === 'number' ? data.conversation_count : null,
    favorite_count:
      typeof data.favorite_count === 'number' ? data.favorite_count : 0,
    avatar_media_url: data.user?.profile_image_url_https,
    media: media.length > 0 ? media : undefined,
    reply_to_tweet_id: data.in_reply_to_status_id_str ?? null,
    reply_to_username: data.in_reply_to_screen_name ?? null,
    reply_to_user_id: data.in_reply_to_user_id_str ?? null,
    from_external: true,
  }
}

/**
 * Hydrate multiple tweet ids in parallel. Failed lookups become null in the
 * returned map. Bounded by `limit` to keep page latency reasonable when a thread
 * references many deleted tweets.
 */
export async function fetchSyndicatedTweets(
  ids: string[],
  { limit = 12 }: { limit?: number } = {},
): Promise<Map<string, SyndicatedTweet | null>> {
  const unique = Array.from(new Set(ids)).slice(0, limit)
  const results = await Promise.all(unique.map((id) => fetchSyndicatedTweet(id)))
  return new Map(unique.map((id, i) => [id, results[i]]))
}
