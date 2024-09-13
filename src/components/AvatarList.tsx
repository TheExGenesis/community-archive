'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

type Avatar = {
  username: string
  avatar_media_url: string
  num_tweets?: number
}

type AvatarListProps = {
  initialAvatars: Avatar[]
  title?: string
}
const AvatarList = ({ initialAvatars, title = 'Avatars' }: AvatarListProps) => {
  const [avatars, setAvatars] = useState(initialAvatars)

  useEffect(() => {
    setAvatars(initialAvatars)
  }, [initialAvatars])

  if (avatars.length === 0) {
    return <p className="text-sm">No avatars available.</p>
  }
  return (
    <div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-8 md:gap-4 pb-2">
        {avatars.map((avatar, index) => (
          <a
            key={avatar.username}
            href={`https://x.com/${avatar.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col items-start ${index > 5 ? 'md:hidden' : ''}`}
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full bg-gray-200 ">
              <img
                src={avatar.avatar_media_url}
                alt={`${avatar.username}'s avatar`}
                width={120}
                height={120}
                className="rounded-full"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.onerror = null // Prevent infinite loop
                  target.src =
                    'https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/assets/placeholder.jpg?t=2024-09-09T21%3A51%3A06.677Z'
                }}
              />
            </div>
            <span
              className="mt-1 whitespace-nowrap  truncate text-sm hover:underline"
              style={{ maxWidth: '100%' }}
            >
              {avatar.username}
            </span>
            <span
              className="mt-1  whitespace-nowrap text-justify text-xs text-zinc-500 hover:underline"
              style={{ maxWidth: '40px' }}
            >
              {avatar.num_tweets && `${avatar.num_tweets} tweets`}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default AvatarList
