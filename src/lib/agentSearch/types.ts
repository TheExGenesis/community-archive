import type { PortalTweet } from '@/lib/portal/types'

/** A tweet as agent tools return it to the page: a PortalTweet plus edges. */
export interface AgentTweet extends PortalTweet {
  replyToTweetId: string | null
  replyToUsername: string | null
  quoteTweetId: string | null
}

/** A tweet with a classifier probability attached. */
export interface ScoredTweet extends AgentTweet {
  p: number
}

/** What the model sees for each tweet: short and id-first. */
export interface CompactTweet {
  id: string
  author: string
  date: string
  text: string
  replyTo?: string
  quotes?: string
  likes: number
  p?: number
}

export const COMPACT_TEXT_LIMIT = 500

export function compactTweet(tweet: AgentTweet & { p?: number }): CompactTweet {
  const text =
    tweet.text.length > COMPACT_TEXT_LIMIT
      ? `${tweet.text.slice(0, COMPACT_TEXT_LIMIT)}…`
      : tweet.text
  return {
    id: tweet.id,
    author: `@${tweet.username}`,
    date: tweet.createdAt.slice(0, 10),
    text,
    ...(tweet.replyToTweetId ? { replyTo: tweet.replyToTweetId } : {}),
    ...(tweet.quoteTweetId ? { quotes: tweet.quoteTweetId } : {}),
    likes: tweet.likes,
    ...(tweet.p === undefined ? {} : { p: Math.round(tweet.p * 100) / 100 }),
  }
}

/** Run record persisted per question (see runStore). */
export type AgentSearchRunStatus = 'running' | 'completed' | 'failed'

export interface AgentSearchRun {
  id: string
  accountId: string
  question: string
  status: AgentSearchRunStatus
  model: string
  startedAt: string
  completedAt: string | null
  answer: string | null
  citedTweetIds: string[]
  invalidCitationIds: string[]
  toolCalls: Array<{
    name: string
    input: unknown
    ms?: number
    count?: number
  }>
  inputTokens: number
  outputTokens: number
  costUsd: number
  error: string | null
}
