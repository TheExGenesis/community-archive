import { FaHeart, FaRetweet, FaExternalLinkAlt, FaReply } from 'react-icons/fa'

interface TweetData {
    username: string
    displayName: string
    profilePicUrl: string
    full_text: string
    favorite_count: number
    retweet_count: number
    created_at: string
    tweet_id: string
    reply_to_username?: string
    account: { 
        profile: Array<{
            avatar_media_url?:string
        }>,
        username?: string, 
        account_display_name?:string 
    }
}

interface TweetProps {
  tweet: TweetData
}

export default function Tweet({ tweet }: TweetProps) {
    const username = tweet['account']?.username || 'Unknown'
    const displayName = tweet['account']?.account_display_name || 'Unknown'
    const profilePicUrl = tweet['account']?.['profile'][0]?.avatar_media_url || 'https://pbs.twimg.com/profile_images/1821884121850970112/f04rgSFD_400x400.jpg'
    const tweet_url = `https://twitter.com/${tweet['account']?.username || 'unknown'}/status/${tweet.tweet_id}`
    const replyToUsername = tweet.reply_to_username

  return (
    <div className="mb-4 rounded-lg bg-white p-4 shadow-md dark:bg-gray-800">
      <div className="mb-2 flex items-start">
        <img
          src={profilePicUrl}
          alt={`${displayName}'s profile picture`}
          width={48}
          height={48}
          className="mr-3 rounded-full"
        />
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
      <p className="mb-2 text-gray-700 dark:text-gray-300">{tweet.full_text}</p>
      <div className="mb-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
        <span className="mr-4 flex items-center">
          <FaHeart className="mr-1" /> {tweet.favorite_count}
        </span>
        <span className="mr-4 flex items-center">
          <FaRetweet className="mr-1" /> {tweet.retweet_count}
        </span>
        <span>{new Date(tweet.created_at).toLocaleDateString()}</span>
      </div>
      <a
        href={`/tweets/${tweet.tweet_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center text-blue-500 hover:underline"
      >
        <FaExternalLinkAlt className="mr-1" /> Permalink
      </a>
      <a
        href={tweet_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center text-blue-500 hover:underline"
      >
        <FaExternalLinkAlt className="mr-1" /> View on Twitter
      </a>
    </div>
  )
}
