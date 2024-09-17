'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

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
      <div className="w-full">
        <div className="flex justify-between pb-2">
          {avatars.map((avatar) => (
            <a
              key={avatar.username}
              href={`https://x.com/${avatar.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={avatar.avatar_media_url}
                  alt={`${avatar.username}'s avatar`}
                />
                <AvatarFallback>
                  {avatar.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className="mt-1 whitespace-nowrap text-justify text-xs hover:underline"
                style={{ maxWidth: '40px', fontSize: '10px' }}
              >
                {avatar.username}
              </span>
              <span
                className="mt-1 whitespace-nowrap text-justify text-xs text-zinc-500 hover:underline"
                style={{ maxWidth: '40px', fontSize: '10px' }}
              >
                {avatar.num_tweets && `${avatar.num_tweets} tweets`}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AvatarList
