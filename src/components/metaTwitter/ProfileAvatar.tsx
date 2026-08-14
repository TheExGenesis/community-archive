'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'

export function ProfileAvatar({
  accountId,
  avatarUrl,
  displayName,
}: {
  accountId: string
  avatarUrl: string | null
  displayName: string
}) {
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState(
    getHighResolutionAvatarUrl(avatarUrl) ?? null,
  )
  const attemptedRecovery = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const recoverAvatar = useCallback(() => {
    if (attemptedRecovery.current) return
    attemptedRecovery.current = true
    void fetch(`/api/profile/${encodeURIComponent(accountId)}/avatar`)
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
  }, [accountId])

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
          recoverAvatar()
        }}
        className="relative z-10 -mt-[66px] h-[132px] w-[132px] rounded-full border-4 border-card bg-muted object-cover"
      />
    )
  }

  return (
    <div className="relative z-10 -mt-[66px] grid h-[132px] w-[132px] place-items-center rounded-full border-4 border-card bg-muted text-4xl font-bold">
      {displayName.charAt(0).toUpperCase()}
    </div>
  )
}
