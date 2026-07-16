'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AvatarType } from '@/lib/types'
import { formatNumber } from '@/lib/formatNumber'

type AvatarListProps = {
  initialAvatars: AvatarType[]
  title?: string
  compact?: boolean
}
const AvatarList = ({
  initialAvatars,
  title = 'Avatars',
  compact = false,
}: AvatarListProps) => {
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
        <div
          className={`flex flex-wrap justify-center pb-2 ${
            compact ? 'gap-x-2 gap-y-3' : 'gap-x-4 gap-y-6'
          }`}
        >
          {avatars.map((avatar) => (
            <a
              key={avatar.username}
              href={`/user/${avatar.account_id}`}
              className={`flex flex-col items-center text-center ${
                compact ? 'w-14' : 'w-20'
              }`}
            >
              <Avatar className={compact ? 'h-9 w-9' : 'h-12 w-12'}>
                <AvatarImage
                  src={avatar.avatar_media_url}
                  alt={`${avatar.username}'s avatar`}
                />
                <AvatarFallback>
                  {avatar.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className={`mt-1 break-words hover:underline ${
                  compact ? 'text-[10px]' : 'text-xs'
                }`}
              >
                {avatar.username}
              </span>
              <span
                className={`mt-0.5 text-muted-foreground ${
                  compact ? 'text-[8px]' : 'text-[10px]'
                }`}
              >
                {avatar.num_followers &&
                  `${formatNumber(avatar.num_followers)} followers`}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AvatarList
