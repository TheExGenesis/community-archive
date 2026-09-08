'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
export function StrandThreadContext({
  seedId,
  tweetId,
}: {
  seedId: string
  tweetId: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{
    before: PortalTweet[]
    after: PortalTweet[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController>()
  useEffect(() => () => controller.current?.abort(), [])
  async function load() {
    if (loading) return
    setOpen(true)
    if (data) return
    const abort = new AbortController()
    controller.current = abort
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/strands/${seedId}/context?tweet_id=${tweetId}`,
        { signal: abort.signal, cache: 'no-store' },
      )
      if (!response.ok)
        throw new Error('Thread context could not load. Please try again.')
      setData(await response.json())
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      if (!abort.signal.aborted) setLoading(false)
    }
  }
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap justify-between gap-3 text-xs font-semibold">
        <button
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : void load())}
          className="text-brand"
        >
          {open ? 'Hide thread context' : 'Show thread context'}
        </button>
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
            Up to five ancestors and five nearby replies, following this post’s
            thread.
          </p>
          {loading && (
            <p role="status" className="text-sm">
              Loading context…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}{' '}
              <button
                onClick={() => void load()}
                className="text-brand underline"
              >
                Try again
              </button>
            </p>
          )}
          {data && (
            <>
              {data.before.length > 0 && (
                <h4 className="text-xs font-bold uppercase tracking-wide">
                  Before this post
                </h4>
              )}
              {data.before.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} noClamp showDate />
              ))}
              <div className="border-y border-dashed border-border py-3 text-center text-xs font-semibold">
                Selected key post ↑
              </div>
              {data.after.length > 0 && (
                <h4 className="text-xs font-bold uppercase tracking-wide">
                  Nearby replies
                </h4>
              )}
              {data.after.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} noClamp showDate />
              ))}
              {!data.before.length && !data.after.length && (
                <p className="text-sm text-muted-foreground">
                  No surrounding posts are currently available in the archive.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
