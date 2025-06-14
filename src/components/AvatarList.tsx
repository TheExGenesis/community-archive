'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AvatarType } from '@/lib/types'
import { formatNumber } from '@/lib/formatNumber'

type AvatarListProps = {
  initialAvatars: AvatarType[]
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
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-6 pb-2">
          {avatars.map((avatar) => (
            <a
              key={avatar.username}
              href={`/user/${avatar.account_id}`}
              className="flex flex-col items-center text-center w-20"
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
                className="mt-1 text-xs hover:underline break-words"
              >
                {avatar.username}
              </span>
              <span
                className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
              >
                {avatar.num_followers &&
                  `${formatNumber(avatar.num_followers)} followers`}
              </span>
              <span
                className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
              >
                {avatar.num_tweets &&
                  `${formatNumber(avatar.num_tweets)} tweets`}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AvatarList
