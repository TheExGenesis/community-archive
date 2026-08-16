'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AvatarType } from '@/lib/types'
import { formatNumber } from '@/lib/formatNumber'
import Link from 'next/link'
import { userProfileHref } from '@/lib/navigation'

type AvatarListProps = {
  initialAvatars: AvatarType[]
  title?: string
  compact?: boolean
}

function RecoverableArchiveAvatar({
  avatar,
  compact,
}: {
  avatar: AvatarType
  compact: boolean
}) {
  const [avatarUrl, setAvatarUrl] = useState(
    avatar.avatar_media_url || undefined,
  )
  const attemptedRecovery = useRef(false)

  useEffect(() => {
    attemptedRecovery.current = false
    setAvatarUrl(avatar.avatar_media_url || undefined)
  }, [avatar.account_id, avatar.avatar_media_url])

  const recoverAvatar = useCallback(() => {
    if (attemptedRecovery.current) return
    attemptedRecovery.current = true
    void fetch(`/api/profile/${encodeURIComponent(avatar.account_id)}/avatar`)
      .then(async (response) => {
        if (!response.ok) return null
        const body = (await response.json()) as { avatar_media_url?: unknown }
        return typeof body.avatar_media_url === 'string' &&
          body.avatar_media_url
          ? body.avatar_media_url
          : null
      })
      .then((recoveredAvatarUrl) => {
        if (recoveredAvatarUrl) setAvatarUrl(recoveredAvatarUrl)
      })
      .catch(() => undefined)
  }, [avatar.account_id])

  useEffect(() => {
    if (!avatar.avatar_media_url) recoverAvatar()
  }, [avatar.avatar_media_url, recoverAvatar])

  return (
    <Avatar className={compact ? 'h-10 w-10' : 'h-12 w-12'}>
      {avatarUrl ? (
        <AvatarImage
          src={avatarUrl}
          alt={`${avatar.username}'s avatar`}
          onError={() => {
            setAvatarUrl(undefined)
            recoverAvatar()
          }}
        />
      ) : null}
      <AvatarFallback>{avatar.username[0].toUpperCase()}</AvatarFallback>
    </Avatar>
  )
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
              <RecoverableArchiveAvatar avatar={avatar} compact={compact} />
              <span
                className={`mt-1 w-full min-w-0 leading-tight [overflow-wrap:anywhere] hover:underline ${
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
