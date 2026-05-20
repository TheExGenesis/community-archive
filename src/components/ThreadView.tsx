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
  className = "" 
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
    reply_to_username: tweet.reply_to_username || undefined
  })

  // Render tweet with children recursively
  const renderTweetWithThread = (tweetId: string, depth: number = 0): JSX.Element => {
    const tweet = tree.tweets[tweetId]
    const children = tree.children[tweetId] || []
    const isHighlighted = highlightTweetId === tweetId

    return (
      <div key={tweetId} className={`thread-tweet-container ${depth > 0 ? 'ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700' : ''}`}>
        {tweet.is_deleted_placeholder ? (
          // Tombstone for a tweet that was deleted but is still referenced as the
          // parent of one or more surviving replies. We don't have author / timestamp /
          // text since the source row is gone.
          <div className="border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 italic p-4 rounded-lg mb-4 text-sm">
            [Tweet deleted]
          </div>
        ) : (
          <div className={`
            ${isHighlighted ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-background dark:bg-secondary'}
            p-4 rounded-lg mb-4
          `}>
            <TweetComponent tweet={convertToTweetData(tweet)} />
          </div>
        )}
        
        {children.length > 0 && (
          <div className="thread-children">
            {children
              .sort((a, b) => {
                const tweetA = tree.tweets[a]
                const tweetB = tree.tweets[b]
                return new Date(tweetA.created_at).getTime() - new Date(tweetB.created_at).getTime()
              })
              .map(childId => renderTweetWithThread(childId, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Render all roots. When some parent tweets in the conversation were deleted, each
  // surviving orphan reply gets a synthesized placeholder parent that becomes its own
  // root, so the tree can have more than one.
  const allRoots = tree.roots && tree.roots.length > 0
    ? tree.roots
    : tree.root ? [tree.root] : []

  if (allRoots.length === 0) {
    return (
      <div className={`${className} text-center py-8`}>
        <p className="text-gray-500 dark:text-gray-400">No thread structure found</p>
      </div>
    )
  }

  // Header count excludes placeholders.
  const realCount = Object.values(tree.tweets).filter(
    (t) => !t.is_deleted_placeholder,
  ).length

  return (
    <div className={`thread-view ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          🧵 Thread ({realCount} {realCount === 1 ? 'tweet' : 'tweets'})
        </h3>
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