'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { formatNumber } from '@/lib/formatNumber'
import { toggleTweetLike, useTweetLike } from '@/lib/tweetLikes/client'

/**
 * The tweet's like count, doubling as the Community Archive like button. The
 * number is the tweet's X likes plus the likes made here.
 */
export function TweetLikeButton({
  tweetId,
  xLikeCount,
  onToggle,
  format = formatNumber,
  className = '',
}: {
  tweetId: string
  xLikeCount: number
  onToggle?: (action: 'like' | 'unlike') => void
  format?: (count: number) => string
  className?: string
}) {
  const { liked, count } = useTweetLike(tweetId)
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    const result = await toggleTweetLike(tweetId)
    setPending(false)
    if (result === 'signed_out') {
      window.location.href = `/login?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`
    } else if (result !== 'error') {
      onToggle?.(result === 'liked' ? 'like' : 'unlike')
    }
  }

  const total = xLikeCount + count
  const action = liked ? 'Unlike' : 'Like'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      title={`${action} · ${format(xLikeCount)} on X, ${format(count)} on Community Archive`}
      className={`inline-flex items-center gap-1 rounded-sm tabular-nums transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        liked ? 'text-brand' : ''
      } ${className}`}
    >
      <Heart
        className={`h-[1em] w-[1em] ${liked ? 'fill-current' : ''}`}
        aria-hidden="true"
      />
      <span aria-hidden="true">{format(total)}</span>
      <span className="sr-only">{`${format(total)} ${total === 1 ? 'like' : 'likes'}`}</span>
    </button>
  )
}

export default TweetLikeButton
