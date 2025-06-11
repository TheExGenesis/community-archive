import { FaHeart, FaRetweet, FaExternalLinkAlt, FaReply } from 'react-icons/fa'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/formatNumber'
import NextImage from 'next/image'

interface TweetMediaItem {
  media_url: string
  media_type: string
  width?: number
  height?: number
}

interface TweetData {
    full_text: string
    favorite_count: number
    retweet_count: number
    created_at: string
    tweet_id: string
    reply_to_username?: string
    account: { 
        profile?: {
            avatar_media_url?:string
        },
        username?: string, 
        account_display_name?:string 
    }
    media?: TweetMediaItem[]
}

interface TweetProps {
  tweet: TweetData
}

export default function Tweet({ tweet }: TweetProps) {
    const username = tweet.account?.username || 'Unknown'
    const displayName = tweet.account?.account_display_name || 'Unknown'
    const profilePicUrl = tweet.account?.profile?.avatar_media_url || '/placeholder.jpg'
    const original_tweet_url = `https://twitter.com/${tweet.account?.username || 'unknown'}/status/${tweet.tweet_id}`
    const replyToUsername = tweet.reply_to_username

  return (
    <div>
      <div className="mb-2 flex items-start">
        <Avatar className="mr-3 h-12 w-12">
          <AvatarImage
            src={profilePicUrl}
            alt={`${displayName}'s profile picture`}
          />
          <AvatarFallback>{displayName?.charAt(0) || username?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center">
            <span className="mr-2 font-bold text-gray-900 dark:text-white">
              {displayName}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              @{username}
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
      <p className="mb-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{tweet.full_text}</p>
      
      {tweet.media && tweet.media.length > 0 && (
        <div className="my-2 flex flex-col space-y-2">
          {tweet.media
            .filter(m => m.media_type === 'photo')
            .map((mediaItem, index) => (
              <div key={index} className="relative overflow-hidden rounded-lg border dark:border-gray-700">
                <NextImage 
                  src={mediaItem.media_url} 
                  alt={`Tweet image ${index + 1}`}
                  width={mediaItem.width || 600}
                  height={mediaItem.height || 400}
                  className="object-contain w-full h-auto"
                />
              </div>
            ))}
        </div>
      )}

      <div className="mb-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
        <span className="mr-4 flex items-center">
          <FaHeart className="mr-1" /> {formatNumber(tweet.favorite_count)}
        </span>
        <span className="mr-4 flex items-center">
          <FaRetweet className="mr-1" /> {formatNumber(tweet.retweet_count)}
        </span>
        <span>{new Date(tweet.created_at).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center space-x-4">
        <a
          href={`/tweets/${tweet.tweet_id}`}
          className="flex items-center text-blue-500 hover:underline dark:text-blue-400"
        >
          <FaExternalLinkAlt className="mr-1" /> Permalink
        </a>
        <a
          href={original_tweet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center text-blue-500 hover:underline dark:text-blue-400"
        >
          <FaExternalLinkAlt className="mr-1" /> View on Twitter
        </a>
      </div>
    </div>
  )
} 