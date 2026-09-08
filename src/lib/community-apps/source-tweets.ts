import 'server-only'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { isClickHouseReadsEnabled } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import { enrichPortalTweets } from '@/lib/portal/data'
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

/** Bounded cited-post reads with current opt-out checks. No corpus scan. */
export async function getSourceTweets(input: string[]) {
  const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
  if (ids.length > 100) throw new Error('Too many source posts requested')
  if (!ids.length) return new Map<string, PortalTweet>()
  let tweets: PortalTweet[] = []
  if (isClickHouseReadsEnabled()) {
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
  } else {
    const { data, error } = await createServerServiceRoleClient()
      .from('enriched_tweets')
      .select(
        'tweet_id,account_id,username,account_display_name,avatar_media_url,full_text,created_at,favorite_count,retweet_count',
      )
      .in('tweet_id', ids)
    if (error) throw new Error('Unable to load source posts')
    tweets = await enrichPortalTweets(
      (data ?? []).flatMap((row) =>
        row.tweet_id && row.username && row.created_at
          ? [
              {
                id: row.tweet_id,
                accountId: row.account_id ?? undefined,
                username: row.username,
                name: row.account_display_name ?? row.username,
                avatar: row.avatar_media_url,
                text: row.full_text ?? '',
                createdAt: row.created_at,
                observedAt: row.created_at,
                likes: row.favorite_count ?? 0,
                rts: row.retweet_count ?? 0,
                retweetCountAvailable: row.retweet_count !== null,
              },
            ]
          : [],
      ),
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
