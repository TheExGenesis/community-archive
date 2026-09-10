'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type Props = {
  accountId: string
  avatarUrl?: string | null
  displayName: string
  alt?: string
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  fallbackLength?: number
}

export default function RecoverableAvatar(props: Props) {
  return (
    <ResolvedAvatar
      key={`${props.accountId}:${props.avatarUrl ?? ''}`}
      {...props}
    />
  )
}

function ResolvedAvatar({
  accountId,
  avatarUrl,
  displayName,
  alt = '',
  className,
  imageClassName,
  fallbackClassName,
  fallbackLength = 1,
}: Props) {
  const [url, setUrl] = useState(avatarUrl || null)
  const attempted = useRef(new Set<boolean>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const recover = useCallback(
    (refresh = false) => {
      if (!/^\d{1,20}$/.test(accountId) || attempted.current.has(refresh))
        return
      attempted.current.add(refresh)
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
        .then((recovered) => {
          if (mounted.current && recovered) setUrl(recovered)
        })
        .catch(() => undefined)
    },
    [accountId],
  )

  useEffect(() => {
    if (!avatarUrl) recover()
  }, [avatarUrl, recover])

  return (
    <Avatar className={className}>
      {url ? (
        <AvatarImage
          src={url}
          alt={alt}
          className={imageClassName}
          onLoadingStatusChange={(status) => {
            // Radix decodes off-DOM; failed images never mount an img/onError.
            if (status === 'error') {
              setUrl(null)
              // Featured/OAuth URLs can lag behind the current profile photo.
              // Try that stored photo before a fresh external lookup.
              recover(attempted.current.has(false))
            }
          }}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>
        {(
          Array.from(displayName).slice(0, fallbackLength).join('') || '@'
        ).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
