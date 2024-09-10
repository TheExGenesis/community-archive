'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

type Avatar = {
  username: string
  avatar_media_url: string
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
        <div className="flex justify-around pb-2">
          {avatars.map((avatar) => (
            <a
              key={avatar.username}
              href={`https://x.com/${avatar.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center"
            >
              <div className="relative h-12 w-12 overflow-hidden rounded-full bg-gray-200 ">
                <img
                  src={avatar.avatar_media_url}
                  alt={`${avatar.username}'s avatar`}
                  width={96}
                  height={96}
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
                className="mt-1 overflow-visible whitespace-nowrap text-justify text-xs hover:underline"
                style={{ maxWidth: '40px' }}
              >
                {avatar.username}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AvatarList
