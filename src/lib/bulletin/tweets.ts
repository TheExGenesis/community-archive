import 'server-only'
import { createHash } from 'crypto'
import { loadBulletinBoardState } from './data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'

function card(tweet: TweetData): PortalTweet {
  const mapMedia = (items: TweetData['media'] | undefined) =>
    (items || []).map((m) => ({
      url: m.media_url,
      type: m.media_type,
      width: m.width,
      height: m.height,
    }))
  const q = tweet.quoted_tweet
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url || null,
    text: tweet.full_text,
    createdAt: tweet.created_at,
    observedAt: tweet.created_at,
    likes: tweet.favorite_count || 0,
    rts: tweet.retweet_count || 0,
    media: mapMedia(tweet.media),
    quotedTweet: q
      ? {
          id: q.tweet_id,
          accountId: q.account_id,
          username: q.username,
          name: q.account_display_name,
          avatar: q.avatar_media_url || null,
          text: q.full_text,
          createdAt: q.created_at,
          likes: q.favorite_count || 0,
          rts: q.retweet_count || 0,
          media: mapMedia(q.media),
          isDeleted: q.is_deleted,
        }
      : undefined,
  }
}

export async function loadBulletinTweets(ids: string[]) {
  // Share the live notice/policy read and source check across a small batch.
  const [state, current, details] = await Promise.all([
    loadBulletinBoardState(),
    fetchAnalyticsGatewayJson<{
      data: Array<{
        tweet_id: string
        account_id: string
        content_hash: string
        reply_to_tweet_id: string | null
        retweet: boolean
        full_text: string
      }>
    }>(['bulletin-sources'], new URLSearchParams({ ids: ids.join(',') })),
    (async () => {
      const details: Array<TweetData | null> = []
      // Avoid an unbounded fan-out of expensive full-fidelity detail queries.
      for (let offset = 0; offset < ids.length; offset += 4) {
        details.push(
          ...(await Promise.all(
            ids
              .slice(offset, offset + 4)
              .map((id) =>
                fetchClickHouseTweetPageData(id, (path, params) =>
                  fetchAnalyticsGatewayJson(path, params),
                ).catch(() => null),
              ),
          )),
        )
      }
      return details
    })(),
  ])
  const notices = new Map(
    state.notices.map((notice) => [notice.tweet_id, notice]),
  )
  const sources = new Map(
    current.data.map((source) => [source.tweet_id, source]),
  )
  const tweets: PortalTweet[] = []
  const errors: Record<string, number> = {}
  ids.forEach((id, index) => {
    const notice = notices.get(id)
    if (!notice) {
      errors[id] = 404
      return
    }
    const source = sources.get(id)
    const detail = details[index]
    if (
      !source ||
      !detail ||
      detail.tweet_id !== id ||
      source.content_hash !== notice.content_hash ||
      source.account_id !== detail.account_id ||
      source.reply_to_tweet_id ||
      source.retweet ||
      source.full_text.startsWith('RT @') ||
      (notice.account_id
        ? detail.account_id !== notice.account_id
        : !state.allowedAccounts?.includes(detail.account_id)) ||
      createHash('sha256').update(detail.full_text).digest('hex') !==
        notice.content_hash
    ) {
      errors[id] = 503
      return
    }
    tweets.push(card(detail))
  })
  return { tweets, errors }
}
