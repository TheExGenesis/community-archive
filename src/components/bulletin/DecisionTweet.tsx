'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { BulletinTweet } from '@/lib/bulletin/tweets'
const TweetCard = dynamic(() =>
  import('@/components/TweetCard').then((m) => m.TweetCard),
)

export function DecisionTweet({ id }: { id: string }) {
  const [tweet, setTweet] = useState<BulletinTweet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  async function load() {
    if (loading || tweet) return
    setLoading(true)
    setError(false)
    try {
      const response = await fetch(`/api/admin/bulletin/tweet?id=${id}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Unavailable')
      const result = await response.json()
      if (!result.tweet) throw new Error('Unavailable')
      setTweet(result.tweet)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load()
      }}
    >
      <summary className="cursor-pointer text-sm text-brand">
        View full tweet, media and quoted post
      </summary>
      <div className="mt-3">
        {loading && <p role="status">Loading post…</p>}
        {error && (
          <p role="alert">
            Post unavailable or changed.{' '}
            <button className="underline" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
        {tweet && (
          <TweetCard
            tweet={tweet}
            clickable={false}
            noClamp
            showDate
            returnTo="/admin/bulletin/decisions"
          />
        )}
      </div>
    </details>
  )
}
