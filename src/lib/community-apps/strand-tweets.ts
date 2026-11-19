import 'server-only'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'
import { getAppPolicy } from './data'

function fromTweet(tweet: TweetData): PortalTweet {
  const quoted = tweet.quoted_tweet
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    text: tweet.full_text,
    avatar: tweet.avatar_media_url,
    createdAt: tweet.created_at,
    observedAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    retweetCountAvailable: tweet.retweet_count !== null,
    media: tweet.media.map((m) => ({
      url: m.media_url,
      type: m.media_type,
      width: m.width,
      height: m.height,
    })),
    quotedTweet: quoted
      ? {
          id: quoted.tweet_id,
          accountId: quoted.account_id,
          username: quoted.username,
          name: quoted.account_display_name,
          avatar: quoted.avatar_media_url ?? null,
          text: quoted.full_text,
          createdAt: quoted.created_at,
          likes: quoted.favorite_count,
          rts: quoted.retweet_count ?? 0,
          media: (quoted.media ?? []).map((m) => ({
            url: m.media_url,
            type: m.media_type,
            width: m.width,
            height: m.height,
          })),
          isDeleted: quoted.is_deleted,
        }
      : undefined,
  }
}

/** Only the current page's seed posts or a single strand's key posts. No corpus scan. */
export async function getStrandTweets(input: string[]) {
  const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
  if (ids.length > 100) throw new Error('Too many strand posts requested')
  if (!ids.length) return new Map<string, PortalTweet>()
  // ClickHouse is the only corpus source; the Supabase fallback was retired.
  const tweets: PortalTweet[] = []
  // Use the same record source as /tweets/:id, with bounded concurrency.
  for (let offset = 0; offset < ids.length; offset += 4) {
    const rows = await Promise.all(
      ids.slice(offset, offset + 4).map(async (id) => {
        try {
          return await fetchClickHouseTweetPageData(id)
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.startsWith(
              'ClickHouse analytics request failed (404):',
            )
          )
            return null
          throw error
        }
      }),
    )
    tweets.push(
      ...rows.filter((t): t is TweetData => t !== null).map(fromTweet),
    )
  }
  const { blocked, blockedIds } = await getAppPolicy([])
  const allowed = (tweet: { username: string; accountId?: string }) =>
    !blocked.has(tweet.username.toLowerCase()) &&
    !blockedIds.has(tweet.accountId ?? '')
  return new Map(
    tweets.filter(allowed).map((tweet) => [
      tweet.id,
      {
        ...tweet,
        quotedTweet:
          tweet.quotedTweet && !allowed(tweet.quotedTweet)
            ? undefined
            : tweet.quotedTweet,
      },
    ]),
  )
}
