import Image from 'next/image'
import { FaHeart, FaRetweet, FaExternalLinkAlt, FaReply } from 'react-icons/fa'

interface TweetProps {
  username: string
  displayName: string
  profilePicUrl: string
  text: string
  favoriteCount: number
  retweetCount: number
  date: string
  tweetUrl: string
  replyToUsername?: string
}

export default function Tweet({
  username,
  displayName,
  profilePicUrl,
  text,
  favoriteCount,
  retweetCount,
  date,
  tweetUrl,
  replyToUsername,
}: TweetProps) {
  return (
    <div className="mb-4 rounded-lg bg-white p-4 shadow-md dark:bg-black">
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
      <p className="mb-2 text-gray-700 dark:text-gray-300">{text}</p>
      <div className="mb-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
        <span className="mr-4 flex items-center">
          <FaHeart className="mr-1" /> {favoriteCount}
        </span>
        <span className="mr-4 flex items-center">
          <FaRetweet className="mr-1" /> {retweetCount}
        </span>
        <span>{new Date(date).toLocaleDateString()}</span>
      </div>
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center text-blue-500 hover:underline"
      >
        <FaExternalLinkAlt className="mr-1" /> View on Twitter
      </a>
    </div>
  )
}
