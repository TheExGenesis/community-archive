'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'

export function DigestLikeButton({
  editionId,
  initialCount,
  initialLiked = false,
  isSignedIn = false,
}: {
  editionId: string
  initialCount: number
  initialLiked?: boolean
  isSignedIn?: boolean
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)
  const [signedIn, setSignedIn] = useState(isSignedIn)

  // The digest pages are ISR-cached and shared between sessions, so the
  // server-rendered props can't be trusted for viewer state. Reconcile from
  // the API, which reads the real session cookie.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch(`/api/digest/${editionId}/like`)
        if (!response.ok) return
        const data = (await response.json()) as {
          liked?: boolean
          signedIn?: boolean
          count?: number
        }
        if (!active) return
        if (typeof data.liked === 'boolean') setLiked(data.liked)
        if (typeof data.signedIn === 'boolean') setSignedIn(data.signedIn)
        if (typeof data.count === 'number') setCount(data.count)
      } catch {
        // Keep the server-rendered state on network failure.
      }
    })()
    return () => {
      active = false
    }
  }, [editionId])

  const toggle = async () => {
    if (!signedIn) {
      // Tooltips never show on touch devices, so the signed-out button acts
      // as its own affordance and routes to sign-in.
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      return
    }
    if (pending) return
    const nextLiked = !liked
    // Optimistic: revert both values together if the request fails.
    const previous = { liked, count }
    setLiked(nextLiked)
    setCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)))
    setPending(true)
    try {
      const response = await fetch(`/api/digest/${editionId}/like`, {
        method: nextLiked ? 'POST' : 'DELETE',
      })
      if (!response.ok)
        throw new Error(`Like request failed: ${response.status}`)
      const data = (await response.json()) as { liked: boolean; count: number }
      setLiked(data.liked)
      setCount(data.count)
    } catch (error) {
      console.error(error)
      setLiked(previous.liked)
      setCount(previous.count)
    } finally {
      setPending(false)
    }
  }

  const label = !signedIn
    ? 'Sign in to like'
    : liked
      ? 'Unlike this edition'
      : 'Like this edition'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={liked}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-brand transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-zinc-800"
    >
      <Heart
        className={`h-5 w-5 ${liked ? 'fill-current' : ''}`}
        strokeWidth={2.25}
      />
      <span className="text-[11.5px] font-bold tabular-nums tracking-[0.08em]">
        {count}
      </span>
    </button>
  )
}
