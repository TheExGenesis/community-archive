'use client'

import { captureProductAction } from '@/lib/productAnalytics'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'

export function StrandThreadContext({
  seedId,
  tweetId,
  children,
}: {
  seedId: string
  tweetId: string
  children?: ReactNode
}) {
  // The map supplies its selected post; timeline rows stay collapsed until opened.
  const automatic = children !== undefined
  const [open, setOpen] = useState(automatic)
  const [data, setData] = useState<{
    before: PortalTweet[]
    after: PortalTweet[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open || data) return
    const abort = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(
          `/api/strands/${seedId}/context?tweet_id=${tweetId}`,
          { signal: abort.signal, cache: 'no-store' },
        )
        if (!response.ok)
          throw new Error('Thread context could not load. Please try again.')
        const result = await response.json()
        if (!abort.signal.aborted) setData(result)
      } catch (err) {
        if (!abort.signal.aborted)
          setError(err instanceof Error ? err.message : 'Please try again.')
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => abort.abort()
  }, [open, data, seedId, tweetId, attempt])
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap justify-between gap-3 text-xs font-semibold">
        {automatic ? (
          <h3>Selected post and its thread</h3>
        ) : (
          <button
            aria-expanded={open}
            onClick={() => {
              if (!open) captureProductAction('strands', 'thread_expanded')
              setOpen(!open)
            }}
            className="text-brand"
          >
            {open ? 'Hide thread context' : 'Show thread context'}
          </button>
        )}
        <Link
          prefetch={false}
          href={`/tweets/${tweetId}`}
          className="text-muted-foreground hover:text-brand"
        >
          Open full conversation ↗
        </Link>
      </div>
      {open && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Archived thread · up to 20 posts before and 20 replies after the
            selected post.
          </p>
          {loading && (
            <p role="status" className="text-sm">
              Loading thread…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}{' '}
              <button
                onClick={() => setAttempt((n) => n + 1)}
                className="text-brand underline"
              >
                Try again
              </button>
            </p>
          )}
          {data?.before.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} noClamp showDate />
          ))}
          {children ? (
            <div className="border-y border-brand/40 py-4">
              <p className="mb-3 text-xs font-semibold text-brand">
                Selected post
              </p>
              {children}
            </div>
          ) : data ? (
            <div className="border-y border-dashed border-border py-3 text-center text-xs font-semibold">
              Selected key post ↑
            </div>
          ) : null}
          {data?.after.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} noClamp showDate />
          ))}
          {data && !data.before.length && !data.after.length && (
            <p className="text-sm text-muted-foreground">
              No surrounding posts are currently available in the archive.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
