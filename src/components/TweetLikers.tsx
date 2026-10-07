'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { userProfileHref } from '@/lib/navigation'
import { useTweetLike } from '@/lib/tweetLikes/client'
import type { TweetLikersResponse } from '@/lib/tweetLikes/types'

const SHOWN_LIKERS = 8

/** Who liked a tweet on Community Archive. Renders nothing without likes. */
export function TweetLikers({ tweetId }: { tweetId: string }) {
  const { count, liked } = useTweetLike(tweetId)
  const [data, setData] = useState<TweetLikersResponse | null>(null)

  // Refetch when the viewer's own like changes the list.
  useEffect(() => {
    let active = true
    if (count === 0) {
      setData(null)
      return () => undefined
    }
    void fetch(`/api/tweets/${tweetId}/likes`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: TweetLikersResponse | null) => {
        if (active) setData(body)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [tweetId, count, liked])

  if (!data || data.likers.length === 0) return null

  const shown = data.likers.slice(0, SHOWN_LIKERS)
  const others = data.count - shown.length

  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Liked on Community Archive by{' '}
      {shown.map((liker, index) => (
        <span key={liker.accountId}>
          {index > 0 && ', '}
          <Link
            href={userProfileHref(liker.username, liker.accountId)}
            className="font-medium text-foreground hover:underline"
          >
            {liker.username
              ? `@${liker.username}`
              : (liker.displayName ?? 'a member')}
          </Link>
        </span>
      ))}
      {others > 0 && ` and ${formatOthers(others)}`}
    </p>
  )
}

const formatOthers = (others: number) =>
  `${others.toLocaleString()} ${others === 1 ? 'other' : 'others'}`

export default TweetLikers
