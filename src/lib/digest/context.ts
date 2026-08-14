import type { Database, Json } from '@/database-types'
import type {
  PortalMedia,
  PortalQuotedTweet,
  PortalTweet,
} from '@/lib/portal/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isRecord } from './types'

export interface DigestReplies {
  tweets: PortalTweet[]
  totalCount: number
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

const count = (value: unknown): number => {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

const mediaItem = (value: unknown): PortalMedia | null => {
  if (!isRecord(value)) return null
  const url = text(value.media_url)
  const type = text(value.media_type)
  if (!url || !type) return null
  const width = Number(value.width)
  const height = Number(value.height)
  return {
    url,
    type,
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  }
}

const quotedTweet = (
  value: unknown,
  mediaByTweetId: Map<string, PortalMedia[]>,
): PortalQuotedTweet | null => {
  if (!isRecord(value)) return null
  const id = text(value.tweet_id)
  const username = text(value.username)
  const tweetText = text(value.full_text)
  const createdAt = text(value.created_at)
  if (!id || !username || !tweetText || !createdAt) return null
  return {
    id,
    accountId: text(value.account_id) ?? undefined,
    username,
    name: text(value.account_display_name) ?? username,
    avatar: text(value.avatar_media_url),
    text: tweetText,
    createdAt,
    likes: count(value.favorite_count),
    rts: count(value.retweet_count),
    media: mediaByTweetId.get(id) ?? [],
  }
}

export function parseDigestReplies(
  value: Json,
  input: {
    bangerTweetId: string
    windowStart: string
    windowEnd: string
    limit: number
  },
): DigestReplies {
  if (!isRecord(value)) return { tweets: [], totalCount: 0 }
  const mediaByTweetId = new Map<string, PortalMedia[]>()
  if (Array.isArray(value.conversation_media)) {
    for (const rawMedia of value.conversation_media) {
      if (!isRecord(rawMedia)) continue
      const tweetId = text(rawMedia.tweet_id)
      const item = mediaItem(rawMedia)
      if (!tweetId || !item) continue
      mediaByTweetId.set(tweetId, [
        ...(mediaByTweetId.get(tweetId) ?? []),
        item,
      ])
    }
  }

  const quotedBySourceId = new Map<string, PortalQuotedTweet>()
  if (Array.isArray(value.quoted_tweets)) {
    for (const rawQuote of value.quoted_tweets) {
      if (!isRecord(rawQuote)) continue
      const sourceId = text(rawQuote.source_tweet_id)
      const quoteMedia = Array.isArray(rawQuote.media)
        ? rawQuote.media.flatMap((item) => {
            const parsed = mediaItem(item)
            return parsed ? [parsed] : []
          })
        : []
      const targetId = text(rawQuote.tweet_id)
      if (targetId && quoteMedia.length) {
        mediaByTweetId.set(targetId, quoteMedia)
      }
      const quote = quotedTweet(rawQuote, mediaByTweetId)
      if (sourceId && quote) quotedBySourceId.set(sourceId, quote)
    }
  }

  const windowStart = new Date(input.windowStart).getTime()
  const windowEnd = new Date(input.windowEnd).getTime()
  const replies = Array.isArray(value.conversation_tweets)
    ? value.conversation_tweets.flatMap((rawTweet): PortalTweet[] => {
        if (!isRecord(rawTweet) || !text(rawTweet.reply_to_tweet_id)) return []
        const id = text(rawTweet.tweet_id)
        const username = text(rawTweet.username)
        const tweetText = text(rawTweet.full_text)
        const createdAt = text(rawTweet.created_at)
        if (
          !id ||
          id === input.bangerTweetId ||
          !username ||
          !tweetText ||
          !createdAt
        ) {
          return []
        }
        const createdTime = new Date(createdAt).getTime()
        if (
          !Number.isFinite(createdTime) ||
          createdTime < windowStart ||
          createdTime >= windowEnd
        ) {
          return []
        }
        return [
          {
            id,
            accountId: text(rawTweet.account_id) ?? undefined,
            username,
            name: text(rawTweet.account_display_name) ?? username,
            avatar: text(rawTweet.avatar_media_url),
            text: tweetText,
            observedAt: createdAt,
            createdAt,
            likes: count(rawTweet.favorite_count),
            rts: count(rawTweet.retweet_count),
            media: mediaByTweetId.get(id) ?? [],
            ...(quotedBySourceId.has(id)
              ? { quotedTweet: quotedBySourceId.get(id) }
              : {}),
          },
        ]
      })
    : []

  replies.sort(
    (left, right) =>
      right.likes - left.likes ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )
  return {
    tweets: replies.slice(0, Math.max(1, Math.min(12, input.limit))),
    totalCount: replies.length,
  }
}

export async function fetchDigestReplies(
  client: SupabaseClient<Database>,
  input: {
    bangerTweetId: string
    windowStart: string
    windowEnd: string
    limit?: number
  },
): Promise<DigestReplies> {
  const { data, error } = await client.rpc('get_tweet_page_data', {
    p_tweet_id: input.bangerTweetId,
  })
  if (error) throw error
  return parseDigestReplies(data, {
    ...input,
    limit: input.limit ?? 8,
  })
}
