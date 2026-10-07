import React from 'react'
import TweetComponent from './TweetComponent'
import { normalizeTweet } from '@/lib/tweets/normalize'
import { ConversationTree } from '@/lib/threadUtils'

interface ThreadViewProps {
  tree: ConversationTree
  highlightTweetId?: string
  heading?: string
  // Render only these subtrees (e.g. the replies under a main tweet) instead
  // of the whole conversation; the count chip then names them replies.
  rootIds?: string[]
  className?: string
}

export const ThreadView: React.FC<ThreadViewProps> = ({
  tree,
  highlightTweetId,
  heading = 'Thread',
  rootIds,
  className = '',
}) => {
  // Render tweet with children recursively
  const renderTweetWithThread = (
    tweetId: string,
    depth: number = 0,
  ): JSX.Element => {
    const tweet = tree.tweets[tweetId]
    const children = tree.children[tweetId] || []
    const isHighlighted = highlightTweetId === tweetId
    // Descendants inherit this first reply wrapper, keeping the rail visible
    // without consuming more horizontal space at every level.
    const replyRail = depth === 1 ? 'border-l-2 border-border pl-3 sm:pl-4' : ''

    return (
      <div key={tweetId} className={`thread-tweet-container ${replyRail}`}>
        {tweet.is_deleted_placeholder ? (
          // Tombstone — deleted from the archive AND syndication couldn't find it.
          <div className="mb-4 rounded-lg border border-dashed border-border bg-muted p-4 text-sm italic text-muted-foreground dark:bg-card">
            [Tweet deleted]
          </div>
        ) : (
          <div
            className={`
            ${
              isHighlighted
                ? // Same pop treatment as a strand's seed post.
                  'border-2 border-foreground/80 bg-card shadow-[3px_3px_0_0_hsl(var(--brand))]'
                : tweet.from_external
                  ? 'rounded-lg border border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10'
                  : 'rounded-lg border border-border bg-card'
            }
            relative mb-4 p-4 sm:p-5
          `}
          >
            {tweet.from_external && (
              // Hydrated at render time from Twitter syndication — not stored in our
              // archive, not returned in search.
              <span className="absolute right-3 top-3 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                from Twitter · not archived
              </span>
            )}
            <TweetComponent
              tweet={normalizeTweet(tweet)}
              isPermalinkPage={isHighlighted}
            />
          </div>
        )}

        {children.length > 0 && (
          <div className="thread-children">
            {children
              .sort((a, b) => {
                const tweetA = tree.tweets[a]
                const tweetB = tree.tweets[b]
                return (
                  new Date(tweetA.created_at).getTime() -
                  new Date(tweetB.created_at).getTime()
                )
              })
              .map((childId) => renderTweetWithThread(childId, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Render all roots. When some parent tweets in the conversation were deleted, each
  // surviving orphan reply gets a synthesized placeholder parent that becomes its own
  // root, so the tree can have more than one.
  const allRoots = rootIds
    ? [...rootIds].sort(
        (a, b) =>
          new Date(tree.tweets[a]!.created_at).getTime() -
          new Date(tree.tweets[b]!.created_at).getTime(),
      )
    : tree.roots && tree.roots.length > 0
      ? tree.roots
      : tree.root
        ? [tree.root]
        : []

  if (allRoots.length === 0) {
    return (
      <div className={`${className} py-8 text-center`}>
        <p className="text-muted-foreground">No thread structure found</p>
      </div>
    )
  }

  // Header count covers the rendered subtrees and excludes placeholders.
  const renderedIds = new Set<string>()
  const collect = (id: string) => {
    if (renderedIds.has(id)) return
    renderedIds.add(id)
    for (const child of tree.children[id] ?? []) collect(child)
  }
  allRoots.forEach(collect)
  const realCount = Array.from(renderedIds).filter(
    (id) => tree.tweets[id] && !tree.tweets[id]!.is_deleted_placeholder,
  ).length
  const [one, many] = rootIds ? ['reply', 'replies'] : ['tweet', 'tweets']

  return (
    <div className={`thread-view ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {realCount} {realCount === 1 ? one : many}
        </span>
      </div>
      <div className="thread-container">
        {allRoots.map((rootId) => (
          <React.Fragment key={rootId}>
            {renderTweetWithThread(rootId)}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export default ThreadView
