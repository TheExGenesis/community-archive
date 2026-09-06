'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'

type ProfileAvatarProps = {
  accountId: string
  avatarUrl: string | null
  displayName: string
}

export function ProfileAvatar(props: ProfileAvatarProps) {
  return (
    <ResolvedProfileAvatar
      key={`${props.accountId}:${props.avatarUrl ?? ''}`}
      {...props}
    />
  )
}

function ResolvedProfileAvatar({
  accountId,
  avatarUrl,
  displayName,
}: ProfileAvatarProps) {
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState(
    getHighResolutionAvatarUrl(avatarUrl) ?? null,
  )
  const attemptedRecovery = useRef(new Set<boolean>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const recoverAvatar = useCallback(
    (refresh = false) => {
      if (attemptedRecovery.current.has(refresh)) return
      attemptedRecovery.current.add(refresh)
      void fetch(
        `/api/profile/${encodeURIComponent(accountId)}/avatar${refresh ? '?refresh=1' : ''}`,
      )
        .then(async (response) => {
          if (!response.ok) return null
          const body = (await response.json()) as { avatar_media_url?: unknown }
          return typeof body.avatar_media_url === 'string' &&
            body.avatar_media_url
            ? body.avatar_media_url
            : null
        })
        .then((recoveredAvatarUrl) => {
          if (recoveredAvatarUrl && mounted.current) {
            setResolvedAvatarUrl(recoveredAvatarUrl)
          }
        })
        .catch(() => undefined)
    },
    [accountId],
  )

  useEffect(() => {
    if (!avatarUrl) recoverAvatar()
  }, [avatarUrl, recoverAvatar])

  if (resolvedAvatarUrl) {
    return (
      <Image
        src={resolvedAvatarUrl}
        alt={`${displayName}'s avatar`}
        width={132}
        height={132}
        sizes="132px"
        priority
        onError={() => {
          setResolvedAvatarUrl(null)
          recoverAvatar(true)
        }}
        className="relative z-10 -mt-[66px] h-[132px] w-[132px] rounded-full border-4 border-card bg-muted object-cover"
      />
    )
  }

  return <ProfileAvatarPlaceholder displayName={displayName} />
}

export function ProfileAvatarPlaceholder({
  displayName,
}: {
  displayName: string
}) {
  return (
    <div className="relative z-10 -mt-[66px] grid h-[132px] w-[132px] place-items-center rounded-full border-4 border-card bg-muted text-4xl font-bold">
      {(Array.from(displayName)[0] ?? '@').toUpperCase()}
    </div>
  )
}
