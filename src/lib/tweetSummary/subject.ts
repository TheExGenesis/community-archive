// Pure helpers that decide what an archive permalink page is about: a single
// tweet or a connected thread, which tweets make up that content, and the
// neutral title shown when no generated summary is available.

import type { ConversationTree, ThreadTweet } from '@/lib/conversationTree'
import type { TweetData } from '@/lib/tweets/types'

export type TweetPageKind = 'tweet' | 'thread'

export interface SummaryTweet {
  tweet_id: string
  account_id: string
  username: string
  display_name: string
  created_at: string
  text: string
  // Media kinds attached ("photo", "video"); the model sees only the text.
  media?: string[]
  quoted?: { username: string; text: string }
}

export interface TweetPageSubject {
  kind: TweetPageKind
  // Cache identity: the same connected sequence shares one summary no matter
  // which of its tweets the permalink highlights.
  key: string
  highlightId: string
  // The tweet, or the connected sequence, in reading order.
  chain: SummaryTweet[]
  // Replies around the chain that may help explain it, most-liked first.
  context: SummaryTweet[]
  author: { username: string; displayName: string }
}

// Keeps one prompt bounded for very long reply chains.
const MAX_CHAIN = 24
const MAX_CONTEXT = 6

type SourceTweet = Pick<
  ThreadTweet,
  | 'tweet_id'
  | 'account_id'
  | 'username'
  | 'account_display_name'
  | 'created_at'
  | 'full_text'
  | 'favorite_count'
  | 'quoted_tweet'
  | 'media'
>

function toSummaryTweet(tweet: SourceTweet): SummaryTweet {
  const quoted =
    tweet.quoted_tweet && !tweet.quoted_tweet.is_deleted
      ? {
          username: tweet.quoted_tweet.username,
          text: tweet.quoted_tweet.full_text,
        }
      : undefined
  const media = (tweet.media ?? []).map(
    (item: { media_type?: string; type?: string }) =>
      String(item?.media_type ?? item?.type ?? 'media'),
  )
  return {
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    username: tweet.username,
    display_name: tweet.account_display_name,
    created_at: tweet.created_at,
    text: tweet.full_text,
    ...(media.length ? { media } : {}),
    ...(quoted ? { quoted } : {}),
  }
}

const byCreatedAt = (tree: ConversationTree) => (a: string, b: string) =>
  new Date(tree.tweets[a]!.created_at).getTime() -
  new Date(tree.tweets[b]!.created_at).getTime()

/** Ancestors of the highlighted tweet, root first, stopping at a deleted gap. */
function ancestorPath(tree: ConversationTree, highlightId: string): string[] {
  const path = [highlightId]
  let current = tree.parents[highlightId]
  while (current && tree.tweets[current] && !path.includes(current)) {
    if (tree.tweets[current]!.is_deleted_placeholder) break
    path.unshift(current)
    current = tree.parents[current]
  }
  return path
}

/** The highlighted author's own follow-up replies, in order. */
function selfContinuation(
  tree: ConversationTree,
  highlightId: string,
): string[] {
  const authorId = tree.tweets[highlightId]!.account_id
  const continuation: string[] = []
  let current = highlightId
  for (;;) {
    const next = (tree.children[current] ?? [])
      .filter((id) => {
        const child = tree.tweets[id]
        return (
          child &&
          !child.is_deleted_placeholder &&
          child.account_id === authorId
        )
      })
      .sort(byCreatedAt(tree))[0]
    if (!next || continuation.includes(next)) return continuation
    continuation.push(next)
    current = next
  }
}

function windowAround(ids: string[], highlightId: string): string[] {
  if (ids.length <= MAX_CHAIN) return ids
  // Keep the opening tweet for context, then the stretch around the highlight.
  const index = ids.indexOf(highlightId)
  const span = MAX_CHAIN - 1
  const start = Math.max(
    1,
    Math.min(index - Math.floor(span / 2), ids.length - span),
  )
  return [ids[0]!, ...ids.slice(start, start + span)]
}

/**
 * A page is a thread when the highlighted tweet sits in a connected sequence:
 * it replies to earlier archived tweets, or its author continues it with
 * self-replies. A standalone tweet that merely collected replies stays a tweet.
 */
export function buildTweetPageSubject(
  tweet: TweetData,
  tree: ConversationTree | null,
): TweetPageSubject {
  const highlightId = tweet.tweet_id
  const inTree = tree?.tweets[highlightId]

  const chainIds =
    tree && inTree
      ? windowAround(
          [
            ...ancestorPath(tree, highlightId),
            ...selfContinuation(tree, highlightId),
          ],
          highlightId,
        )
      : [highlightId]

  const chain =
    tree && inTree
      ? chainIds.map((id) => toSummaryTweet(tree.tweets[id]!))
      : [
          toSummaryTweet({
            ...tweet,
            quoted_tweet: tweet.quoted_tweet ?? null,
          }),
        ]

  const kind: TweetPageKind = chain.length > 1 ? 'thread' : 'tweet'
  const chainSet = new Set(chainIds)
  const context =
    tree && inTree
      ? Object.values(tree.tweets)
          .filter(
            (t) =>
              !t.is_deleted_placeholder &&
              !chainSet.has(t.tweet_id) &&
              chainSet.has(tree.parents[t.tweet_id] ?? ''),
          )
          .sort((a, b) => (b.favorite_count ?? 0) - (a.favorite_count ?? 0))
          .slice(0, MAX_CONTEXT)
          .map(toSummaryTweet)
      : []

  const opener = chain[0]!
  return {
    kind,
    key: `${kind}:${opener.tweet_id}-${chain[chain.length - 1]!.tweet_id}:${chain.length}`,
    highlightId,
    chain,
    context,
    author: {
      username: opener.username,
      displayName: opener.display_name?.trim() || `@${opener.username}`,
    },
  }
}

export function fallbackTitle(subject: TweetPageSubject): string {
  return `${subject.kind === 'thread' ? 'Thread' : 'Tweet'} by ${subject.author.displayName}`
}

export function eyebrowLabel(kind: TweetPageKind): string {
  return kind === 'thread' ? 'Archived thread' : 'Archived tweet'
}

/** Tweet text without links or leading reply handles, for previews. */
export function plainTweetText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(?:@\w+\s+)+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
