import React from 'react'
import TweetComponent from './TweetComponent'
import { ConversationTree, ThreadTweet } from '@/lib/threadUtils'

interface ThreadViewProps {
  tree: ConversationTree
  highlightTweetId?: string
  className?: string
}

export const ThreadView: React.FC<ThreadViewProps> = ({
  tree,
  highlightTweetId,
  className = '',
}) => {
  // Convert ThreadTweet to TweetData format for TweetComponent
  const convertToTweetData = (tweet: ThreadTweet) => ({
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    retweet_count: tweet.retweet_count,
    favorite_count: tweet.favorite_count,
    reply_to_tweet_id: tweet.reply_to_tweet_id,
    quote_tweet_id: tweet.quote_tweet_id || null,
    quoted_tweet: tweet.quoted_tweet || undefined,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.avatar_media_url || null,
    username: tweet.username,
    account_display_name: tweet.account_display_name,
    media: tweet.media || [],
    urls: [],
    reply_to_username: tweet.reply_to_username || undefined,
  })

  // Render tweet with children recursively
  const renderTweetWithThread = (
    tweetId: string,
    depth: number = 0,
  ): JSX.Element => {
    const tweet = tree.tweets[tweetId]
    const children = tree.children[tweetId] || []
    const isHighlighted = highlightTweetId === tweetId

    return (
      <div
        key={tweetId}
        className={`thread-tweet-container ${depth > 0 ? 'ml-3 border-l-2 border-border pl-3 sm:ml-8 sm:pl-4' : ''}`}
      >
        {tweet.is_deleted_placeholder ? (
          // Tombstone — deleted from the archive AND syndication couldn't find it.
          <div className="mb-4 rounded-lg border border-dashed border-border bg-muted p-4 text-sm italic text-muted-foreground dark:bg-card">
            [Tweet deleted]
          </div>
        ) : (
          <div
            className={`
            ${isHighlighted ? 'border-brand/50 bg-card ring-1 ring-brand/20' : tweet.from_external ? 'border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10' : 'border-border bg-card'}
            relative mb-4 rounded-xl border p-4 sm:p-5
          `}
          >
            {tweet.from_external && (
              // Hydrated at render time from Twitter syndication — not stored in our
              // archive, not returned in search.
              <span className="absolute right-3 top-3 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                from Twitter · not archived
              </span>
            )}
            <TweetComponent tweet={convertToTweetData(tweet)} />
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
  const allRoots =
    tree.roots && tree.roots.length > 0
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

  // Header count excludes placeholders.
  const realCount = Object.values(tree.tweets).filter(
    (t) => !t.is_deleted_placeholder,
  ).length

  return (
    <div className={`thread-view ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">Thread</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {realCount} {realCount === 1 ? 'tweet' : 'tweets'}
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
