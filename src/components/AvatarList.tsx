'use client'

import { useEffect, useState } from 'react'
import RecoverableAvatar from '@/components/RecoverableAvatar'
import { AvatarType } from '@/lib/types'
import { formatNumber } from '@/lib/formatNumber'
import Link from '@/components/IntentLink'
import { userProfileHref } from '@/lib/navigation'

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
            compact ? 'gap-x-3 gap-y-4' : 'gap-x-4 gap-y-6'
          }`}
        >
          {avatars.map((avatar) => (
            <Link
              key={avatar.account_id}
              href={userProfileHref(avatar.username, avatar.account_id)}
              className={`flex flex-col items-center text-center ${
                compact ? 'w-20' : 'w-24'
              }`}
            >
              <RecoverableAvatar
                accountId={avatar.account_id}
                avatarUrl={avatar.avatar_media_url}
                displayName={avatar.username}
                alt={`${avatar.username}'s avatar`}
                className={compact ? 'h-10 w-10' : 'h-12 w-12'}
                imageClassName="home-fade-in"
              />
              <span
                className={`mt-1 w-full min-w-0 leading-tight [overflow-wrap:anywhere] ${
                  compact ? 'min-h-7 text-[11px]' : 'text-xs'
                }`}
              >
                {avatar.username}
              </span>
              <span
                className={`mt-0.5 text-muted-foreground ${
                  compact ? 'text-[9px]' : 'text-[10px]'
                }`}
              >
                {avatar.num_tweets === undefined
                  ? null
                  : `${formatNumber(avatar.num_tweets)} ${
                      avatar.num_tweets === 1 ? 'tweet' : 'tweets'
                    }`}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AvatarList
