'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AvatarImage } from '@/components/ui/avatar'

const avatarRequests = new Map<string, Promise<string | null>>()

async function fetchSyndicatedAvatar(
  username: string,
  tweetId: string,
): Promise<string | null> {
  if (!/^\d{5,}$/.test(tweetId)) return null

  const cacheKey = username.toLowerCase() || tweetId
  const pendingRequest = avatarRequests.get(cacheKey)
  if (pendingRequest) return pendingRequest

  const request = fetch(
    `/api/syndication/avatar/${encodeURIComponent(tweetId)}`,
  )
    .then(async (response) => {
      if (!response.ok) return null
      const data = (await response.json()) as {
        avatar_media_url?: string | null
      }
      return data.avatar_media_url || null
    })
    .catch(() => null)

  avatarRequests.set(cacheKey, request)
  const avatarUrl = await request

  if (!avatarUrl) {
    avatarRequests.delete(cacheKey)
  }

  return avatarUrl
}

export default function TweetAvatarImage({
  src,
  alt,
  username,
  tweetId,
}: {
  src?: string | null
  alt: string
  username: string
  tweetId: string
}) {
  const [resolvedSrc, setResolvedSrc] = useState(src || '')
  const attemptKey = `${username.toLowerCase()}:${tweetId}`
  const attemptedKeyRef = useRef<string | null>(null)

  const recoverAvatar = useCallback(async () => {
    if (attemptedKeyRef.current === attemptKey) return
    attemptedKeyRef.current = attemptKey

    const avatarUrl = await fetchSyndicatedAvatar(username, tweetId)
    if (avatarUrl && attemptedKeyRef.current === attemptKey) {
      setResolvedSrc(avatarUrl)
    }
  }, [attemptKey, tweetId, username])

  useEffect(() => {
    setResolvedSrc(src || '')
    attemptedKeyRef.current = null

    if (!src) {
      void recoverAvatar()
    }
  }, [recoverAvatar, src])

  return (
    <AvatarImage
      src={resolvedSrc || undefined}
      alt={alt}
      onError={() => {
        setResolvedSrc('')
        void recoverAvatar()
      }}
    />
  )
}
