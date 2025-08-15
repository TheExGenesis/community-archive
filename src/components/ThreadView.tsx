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
    quoted_tweet: tweet.quoted_tweet,
    quote_tweet_id: null,
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
        <div className={`
          ${isHighlighted ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-background dark:bg-secondary'} 
          p-4 rounded-lg mb-4
        `}>
          <TweetComponent tweet={convertToTweetData(tweet)} />
        </div>
        
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

  if (!tree.root) {
    return (
      <div className={`${className} text-center py-8`}>
        <p className="text-gray-500 dark:text-gray-400">No thread structure found</p>
      </div>
    )
  }

  return (
    <div className={`thread-view ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          🧵 Thread ({Object.keys(tree.tweets).length} tweets)
        </h3>
      </div>
      <div className="thread-container">
        {renderTweetWithThread(tree.root)}
      </div>
    </div>
  )
}

export default ThreadView