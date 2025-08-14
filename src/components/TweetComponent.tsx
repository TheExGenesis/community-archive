'use client'

import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { FaHeart, FaRetweet, FaExternalLinkAlt, FaReply } from 'react-icons/fa'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/formatNumber'
import NextImage from 'next/image'

export interface TweetMedia {
  media_url: string
  media_type: string
  width?: number
  height?: number
}

export interface TweetUrl {
  expanded_url: string | null
  display_url: string
}

export interface TweetData {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number
  favorite_count: number
  reply_to_tweet_id: string | null
  quote_tweet_id: string | null
  retweeted_tweet_id: string | null
  avatar_media_url: string | null
  username: string
  account_display_name: string
  media: TweetMedia[]
  urls: TweetUrl[]
  reply_to_username?: string
  // For quote tweets
  quoted_tweet?: {
    tweet_id: string
    account_id: string
    created_at: string
    full_text: string
    retweet_count: number
    favorite_count: number
    avatar_media_url?: string
    username: string
    account_display_name: string
    media?: TweetMedia[]
  }
  // Support both interface styles for compatibility
  account?: { 
    profile?: {
      avatar_media_url?: string
    },
    username?: string, 
    account_display_name?: string 
  }
  // For RT tweets with mentioned user data
  mentioned_users?: {
    mentioned_user: {
      user_id: string
      name: string 
      screen_name: string
      account?: {
        username: string
        account_display_name: string
        profile?: {
          avatar_media_url: string
        }
      }
    }
  }[]
}

interface TweetComponentProps {
  tweet: TweetData
  className?: string
}

// Helper function to decode HTML entities
const decodeHtmlEntities = (text: string): string => {
  if (typeof window === 'undefined') {
    // Server-side fallback
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
  }
  // Client-side: use DOM parser
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

export const TweetComponent: React.FC<TweetComponentProps> = ({ tweet, className = "" }) => {
  // Support both interface formats for backwards compatibility
  const originalUsername = tweet.username || tweet.account?.username || 'Unknown'
  const originalDisplayName = tweet.account_display_name || tweet.account?.account_display_name || 'Unknown'
  const originalProfilePicUrl = tweet.avatar_media_url || tweet.account?.profile?.avatar_media_url || '/placeholder.jpg'
  const replyToUsername = tweet.reply_to_username

  const isRetweet = !!tweet.retweeted_tweet_id
  const isQuoteTweet = !!tweet.quote_tweet_id
  
  // Check if this is a retweet that starts with "RT @username"
  const rtMatch = tweet.full_text.match(/^RT @([A-Za-z0-9_]+):/)
  const isRtFormat = !!rtMatch
  
  // For RT tweets, we want to show the retweeted user's info, not the retweeter's
  let displayUsername = originalUsername
  let displayName = originalDisplayName  
  let profilePicUrl = originalProfilePicUrl
  
  if (isRtFormat && rtMatch) {
    const rtUsername = rtMatch[1]
    // Look for the retweeted user in mentioned_users to get their data
    const mentionedUserRecord = tweet.mentioned_users?.find(userRecord => 
      userRecord.mentioned_user.screen_name.toLowerCase() === rtUsername.toLowerCase()
    )
    
    if (mentionedUserRecord) {
      const mentionedUser = mentionedUserRecord.mentioned_user
      displayUsername = mentionedUser.screen_name
      displayName = mentionedUser.name
      
      // Use the mentioned user's avatar if available, otherwise use placeholder
      if (mentionedUser.account?.profile?.avatar_media_url) {
        profilePicUrl = mentionedUser.account.profile.avatar_media_url
      } else {
        // For RT tweets, if we don't have the retweeted user's avatar, use placeholder
        profilePicUrl = '/placeholder.jpg'
      }
    } else {
      // If we can't find the mentioned user data, still use extracted username but placeholder avatar
      displayUsername = rtUsername
      displayName = rtUsername // fallback to username as display name
      profilePicUrl = '/placeholder.jpg'
    }
  }

  

  const formatText = (text: string) => {
    // First decode HTML entities
    let formattedText = decodeHtmlEntities(text)

    // Replace t.co URLs with their expanded versions or display URLs
    if (tweet.urls) {
      tweet.urls.forEach(url => {
        if (url.display_url) {
          const tcoRegex = new RegExp('https://t\\.co/\\w+', 'g')
          formattedText = formattedText.replace(tcoRegex, () => {
            // For quote tweets, don't show the Twitter URL inline
            if (url.expanded_url && url.expanded_url.includes('twitter.com/') && url.expanded_url.includes('/status/')) {
              return ''
            }
            return url.expanded_url || url.display_url
          })
        }
      })
    }

    // Simple URL detection and conversion to links for any remaining URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g
    return formattedText.split(urlRegex).map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a 
            key={index} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {part}
          </a>
        )
      }
      return part
    }).filter(part => part !== '') // Remove empty strings
  }

  const renderMedia = () => {
    // Support both tweet.media and (tweet as any).media for different query formats
    const mediaArray = tweet.media || (tweet as any).media || []
    if (!mediaArray || mediaArray.length === 0) return null

    return (
      <div className="my-2 flex flex-col space-y-2">
        {mediaArray
          .filter((m: any) => m.media_type === 'photo' || m.media_type.startsWith('image/') || m.media_type === 'video')
          .map((mediaItem: any, index: number) => (
            <div key={index} className="relative overflow-hidden rounded-lg border dark:border-gray-700">
              <NextImage 
                src={mediaItem.media_url} 
                alt={`Tweet image ${index + 1}`}
                width={mediaItem.width || 600}
                height={mediaItem.height || 400}
                className="object-contain w-full h-auto max-h-96"
              />
            </div>
          ))}
      </div>
    )
  }

  const renderQuotedTweet = () => {
    if (!isQuoteTweet || !tweet.quoted_tweet) return null
    
    const quotedTweet = tweet.quoted_tweet
    const quotedProfilePic = quotedTweet.avatar_media_url || '/placeholder.jpg'
    
    return (
      <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-start space-x-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage
              src={quotedProfilePic}
              alt={`${quotedTweet.account_display_name}'s profile picture`}
            />
            <AvatarFallback>{quotedTweet.account_display_name?.charAt(0) || quotedTweet.username?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1 mb-1">
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                {quotedTweet.account_display_name}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-sm">
                @{quotedTweet.username}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                • {formatDistanceToNow(new Date(quotedTweet.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
              {decodeHtmlEntities(quotedTweet.full_text)}
            </p>
            {quotedTweet.media && quotedTweet.media.length > 0 && (
              <div className="mt-2 flex flex-col space-y-1">
                {quotedTweet.media
                  .filter((m: any) => m.media_type === 'photo' || m.media_type.startsWith('image/') || m.media_type === 'video')
                  .map((mediaItem: any, index: number) => (
                    <div key={index} className="relative overflow-hidden rounded-md border dark:border-gray-600">
                      <NextImage 
                        src={mediaItem.media_url} 
                        alt={`Quoted tweet image ${index + 1}`}
                        width={300}
                        height={200}
                        className="object-contain w-full h-auto max-h-48"
                      />
                    </div>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <FaHeart className="mr-1" /> {formatNumber(quotedTweet.favorite_count)}
                </span>
                <span className="flex items-center">
                  <FaRetweet className="mr-1" /> {formatNumber(quotedTweet.retweet_count)}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={`/tweets/${quotedTweet.tweet_id}`}
                  className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Permalink to quoted tweet"
                >
                  <FaExternalLinkAlt className="w-3 h-3" />
                </a>
                <a
                  href={`https://twitter.com/${quotedTweet.username}/status/${quotedTweet.tweet_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="View quoted tweet on Twitter"
                >
                  <FaExternalLinkAlt className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {(isRetweet || isRtFormat) && (
        <div className="flex items-center mb-2 text-sm text-gray-500 dark:text-gray-400">
          <FaRetweet className="mr-2" />
          {originalUsername} retweeted
        </div>
      )}

      <div className="mb-2 flex items-start">
        <Avatar className="mr-3 h-12 w-12">
          <AvatarImage
            src={profilePicUrl}
            alt={`${displayName}'s profile picture`}
          />
          <AvatarFallback>{displayName?.charAt(0) || displayUsername?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <span className="mr-2 font-bold text-gray-900 dark:text-white">
              {displayName}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              @{displayUsername}
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
              • {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
            </span>
          </div>
          {replyToUsername && (
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
              <FaReply className="mr-1" />
              Replying to @{replyToUsername}
            </div>
          )}
        </div>
      </div>

      <p className="mb-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
        {formatText(tweet.full_text)}
      </p>
      
      {renderMedia()}
      {renderQuotedTweet()}

      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <span className="flex items-center">
            <FaHeart className="mr-1" /> {formatNumber(tweet.favorite_count)}
          </span>
          <span className="flex items-center">
            <FaRetweet className="mr-1" /> {formatNumber(tweet.retweet_count)}
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs text-gray-400 dark:text-gray-500">
          <span>{new Date(tweet.created_at).toLocaleDateString()}</span>
          <a
            href={`/tweets/${tweet.tweet_id}`}
            className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Permalink"
          >
            <FaExternalLinkAlt className="w-3 h-3" />
          </a>
          <a
            href={`https://twitter.com/${displayUsername}/status/${tweet.tweet_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="View on Twitter"
          >
            <FaExternalLinkAlt className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

export default TweetComponent