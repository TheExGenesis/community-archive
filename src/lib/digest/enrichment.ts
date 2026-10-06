import {
  fetchClickHouseQuotePosts,
  type ClickHouseQuotePostsData,
} from '@/lib/clickhouseQuotePosts'
import {
  fetchClickHouseTweetThreadPageData,
  type ClickHouseTweetThreadPageData,
} from '@/lib/clickhouseTweetPage'
import { quoteTweetToPortalTweet } from '@/lib/portal/quoteTweet'
import type {
  PortalMedia,
  PortalQuotedTweet,
  PortalTweet,
} from '@/lib/portal/types'
import type { ThreadTweet } from '@/lib/conversationTree'
import type { TweetData } from '@/lib/tweets/types'
import type {
  DigestPromptTweetKind,
  DigestTweetRelation,
  EnrichedDigestCandidate,
} from './generation'
import type { DigestCandidate } from './types'

/** Context budgets per banger; the corpus is sent to the model in one request. */
export const DIGEST_CONTEXT_LIMITS = {
  parents: 6,
  quotedThread: 4,
  quotes: 12,
  quoteFetch: 100,
  repliedQuotes: 6,
  repliesPerQuote: 3,
  replies: 8,
  concurrency: 8,
} as const

export interface DigestContextSources {
  fetchThread: (
    tweetId: string,
  ) => Promise<ClickHouseTweetThreadPageData | null>
  fetchQuotePosts: (
    tweetId: string,
    limit: number,
  ) => Promise<ClickHouseQuotePostsData>
}

const DEFAULT_SOURCES: DigestContextSources = {
  fetchThread: (tweetId) => fetchClickHouseTweetThreadPageData(tweetId),
  fetchQuotePosts: (tweetId, limit) =>
    fetchClickHouseQuotePosts(tweetId, limit),
}

export interface DigestEnrichmentResult {
  enrichedCandidates: EnrichedDigestCandidate[]
  failedFetches: number
}

type Window = { windowStart: string; windowEnd: string }

const portalMedia = (media: TweetData['media'] | ThreadTweet['media']) =>
  ((media ?? []) as NonNullable<TweetData['media']>).map(
    (item): PortalMedia => ({
      url: item.media_url,
      type: item.media_type,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
    }),
  )

const portalQuoted = (
  quoted: ThreadTweet['quoted_tweet'] | TweetData['quoted_tweet'],
): PortalQuotedTweet | undefined =>
  quoted && !quoted.is_deleted && quoted.full_text
    ? {
        id: quoted.tweet_id,
        accountId: quoted.account_id || undefined,
        username: quoted.username,
        name: quoted.account_display_name || quoted.username,
        avatar: quoted.avatar_media_url ?? null,
        text: quoted.full_text,
        createdAt: quoted.created_at,
        likes: quoted.favorite_count,
        rts: quoted.retweet_count ?? 0,
        media: portalMedia(quoted.media),
      }
    : undefined

const threadTweetToPortalTweet = (tweet: ThreadTweet): PortalTweet => {
  const quotedTweet = portalQuoted(tweet.quoted_tweet)
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id || undefined,
    username: tweet.username,
    name: tweet.account_display_name || tweet.username,
    avatar: tweet.avatar_media_url ?? null,
    text: tweet.full_text,
    observedAt: tweet.created_at,
    createdAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    media: portalMedia(tweet.media),
    ...(quotedTweet ? { quotedTweet } : {}),
  }
}

const quotedToPortalTweet = (quoted: PortalQuotedTweet): PortalTweet => ({
  ...quoted,
  observedAt: quoted.createdAt,
})

const inWindow = (createdAt: string, window: Window) => {
  const time = Date.parse(createdAt)
  return (
    Number.isFinite(time) &&
    time >= Date.parse(window.windowStart) &&
    time < Date.parse(window.windowEnd)
  )
}

const byLikes = (left: ThreadTweet, right: ThreadTweet) =>
  right.favorite_count - left.favorite_count ||
  right.created_at.localeCompare(left.created_at) ||
  right.tweet_id.localeCompare(left.tweet_id)

const usable = (tweet: ThreadTweet | undefined): tweet is ThreadTweet =>
  Boolean(
    tweet &&
      !tweet.is_deleted_placeholder &&
      tweet.full_text &&
      tweet.username &&
      tweet.created_at,
  )

/** Real reply-chain ancestors of a tweet, oldest first. */
export function threadAncestors(
  page: ClickHouseTweetThreadPageData | null,
  tweetId: string,
  limit: number,
): ThreadTweet[] {
  const tree = page?.threadTree
  if (!tree) return []
  const ancestors: ThreadTweet[] = []
  const seen = new Set([tweetId])
  let parentId =
    tree.parents[tweetId] ?? tree.tweets[tweetId]?.reply_to_tweet_id
  while (parentId && !seen.has(parentId) && ancestors.length < limit) {
    seen.add(parentId)
    const parent = tree.tweets[parentId]
    if (!usable(parent)) break
    ancestors.unshift(parent)
    parentId = tree.parents[parentId] ?? parent.reply_to_tweet_id
  }
  return ancestors
}

/** In-window replies anywhere below a tweet, most-liked first. */
export function threadDescendantReplies(
  page: ClickHouseTweetThreadPageData | null,
  tweetId: string,
  window: Window,
): ThreadTweet[] {
  const tree = page?.threadTree
  if (!tree) return []
  const replies: ThreadTweet[] = []
  const seen = new Set([tweetId])
  const queue = [...(tree.children[tweetId] ?? [])]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    queue.push(...(tree.children[id] ?? []))
    const tweet = tree.tweets[id]
    if (usable(tweet) && inWindow(tweet.created_at, window)) replies.push(tweet)
  }
  return replies.sort(byLikes)
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < values.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        values.slice(index, index + concurrency).map(worker),
      )),
    )
  }
  return results
}

/**
 * Gather the conversation around one banger: the reply chain it answers, the
 * post it quotes and that post's thread, in-window quote posts with the
 * replies they drew, and in-window replies to the banger itself.
 */
async function enrichCandidate(
  candidate: DigestCandidate,
  window: Window,
  sources: DigestContextSources,
): Promise<{ enriched: EnrichedDigestCandidate; failedFetches: number }> {
  const limits = DIGEST_CONTEXT_LIMITS
  const banger = candidate.tweet
  let failedFetches = 0
  const settle = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise
    } catch (error) {
      failedFetches += 1
      console.error('Digest context fetch failed:', {
        tweetId: banger.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return fallback
    }
  }

  const [page, quotePosts] = await Promise.all([
    settle(sources.fetchThread(banger.id), null),
    settle(sources.fetchQuotePosts(banger.id, limits.quoteFetch), {
      tweets: [],
      totalCount: 0,
    }),
  ])

  const commentary: PortalTweet[] = []
  const contextKinds: Record<string, DigestPromptTweetKind> = {}
  const relations: Record<string, DigestTweetRelation> = {}
  const add = (
    tweet: PortalTweet,
    kind: DigestPromptTweetKind,
    relation: DigestTweetRelation,
  ) => {
    if (tweet.id === banger.id || contextKinds[tweet.id]) return
    commentary.push(tweet)
    contextKinds[tweet.id] = kind
    relations[tweet.id] = relation
  }
  const relationOf = (tweet: {
    reply_to_tweet_id?: string | null
    quote_tweet_id?: string | null
  }): DigestTweetRelation => ({
    ...(tweet.reply_to_tweet_id
      ? { replyToTweetId: tweet.reply_to_tweet_id }
      : {}),
    ...(tweet.quote_tweet_id ? { quotesTweetId: tweet.quote_tweet_id } : {}),
  })

  // The banger's own place in its conversation.
  const selected = page?.tweet
  if (selected) relations[banger.id] = relationOf(selected)
  for (const parent of threadAncestors(page, banger.id, limits.parents)) {
    add(threadTweetToPortalTweet(parent), 'parent', relationOf(parent))
  }

  // The post the banger quotes, and the thread that post sits in.
  const quoted = portalQuoted(selected?.quoted_tweet)
  if (quoted) {
    const quotedPage = await settle(sources.fetchThread(quoted.id), null)
    const quotedSelected = quotedPage?.tweet
    for (const ancestor of threadAncestors(
      quotedPage,
      quoted.id,
      limits.quotedThread,
    )) {
      add(
        threadTweetToPortalTweet(ancestor),
        'quoted_thread',
        relationOf(ancestor),
      )
    }
    add(
      quotedToPortalTweet(quoted),
      'quoted',
      quotedSelected ? relationOf(quotedSelected) : {},
    )
  }

  // In-window replies to the banger, wherever they sit below it.
  const replies = threadDescendantReplies(page, banger.id, window)
  for (const reply of replies.slice(0, limits.replies)) {
    add(threadTweetToPortalTweet(reply), 'reply', relationOf(reply))
  }

  // In-window quote posts, plus the replies the most-liked ones drew.
  const quotes = quotePosts.tweets
    .filter((tweet) => inWindow(tweet.created_at, window))
    .slice(0, limits.quotes)
  for (const quote of quotes) {
    add(quoteTweetToPortalTweet(quote, banger), 'quote', {
      quotesTweetId: banger.id,
    })
  }
  const repliedQuotes = [...quotes]
    .sort((left, right) => right.favorite_count - left.favorite_count)
    .slice(0, limits.repliedQuotes)
  const quoteThreads = await Promise.all(
    repliedQuotes.map((quote) =>
      settle(sources.fetchThread(quote.tweet_id), null).then((quotePage) => ({
        quote,
        quotePage,
      })),
    ),
  )
  for (const { quote, quotePage } of quoteThreads) {
    for (const reply of threadDescendantReplies(
      quotePage,
      quote.tweet_id,
      window,
    ).slice(0, limits.repliesPerQuote)) {
      add(threadTweetToPortalTweet(reply), 'quote_reply', relationOf(reply))
    }
  }

  return {
    enriched: {
      candidate,
      commentary,
      replyTweetIds: commentary
        .filter(({ id }) => contextKinds[id] === 'reply')
        .map(({ id }) => id),
      contextKinds,
      relations,
      totalReplyCount: quotes.length + replies.length,
    },
    failedFetches,
  }
}

/** Shared by the scheduled publisher and the editor workflow. */
export async function enrichDigestCandidates(
  candidates: DigestCandidate[],
  window: Window,
  sources: DigestContextSources = DEFAULT_SOURCES,
): Promise<DigestEnrichmentResult> {
  const results = await mapWithConcurrency(
    candidates,
    DIGEST_CONTEXT_LIMITS.concurrency,
    (candidate) => enrichCandidate(candidate, window, sources),
  )
  return {
    enrichedCandidates: results.map(({ enriched }) => enriched),
    failedFetches: results.reduce(
      (sum, { failedFetches }) => sum + failedFetches,
      0,
    ),
  }
}
