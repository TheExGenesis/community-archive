'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TweetCard from '@/components/TweetCard'
import { captureProductAction } from '@/lib/productAnalytics'
import type { ProfileTimelineKind } from '@/lib/metaTwitter/profilePagination'
import type { PortalTweet } from '@/lib/portal/types'

interface TimelineFeed {
  tweets: PortalTweet[]
  nextOffset: number | null
  truncated?: boolean
}

const KIND_LABELS: Record<ProfileTimelineKind, string> = {
  original: 'Posts',
  all: 'Posts & replies',
}

export const PROFILE_TIMELINE_HEADING_ID = 'profile-timeline-heading'

/**
 * Every archived post by the account, newest first, under the best-of list.
 * Nothing is requested until the section scrolls near the viewport, so a
 * profile with many bangers costs no extra read until someone reaches it.
 */
export function ProfileTimeline({
  accountId,
  avatarUrl,
  returnTo,
}: {
  accountId: string
  avatarUrl: string | null
  returnTo: string
}) {
  const [kind, setKind] = useState<ProfileTimelineKind>('original')
  const [feeds, setFeeds] = useState<
    Partial<Record<ProfileTimelineKind, TimelineFeed>>
  >({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const feed = feeds[kind]
  const hasMore = !feed || feed.nextOffset !== null

  const loadPage = useCallback(
    (requestedKind: ProfileTimelineKind, offset: number) => {
      const requestKey = `${requestedKind}:${offset}`
      if (inFlight.current === requestKey) return
      inFlight.current = requestKey
      setLoading(true)
      setFailed(false)
      const params = new URLSearchParams({
        kind: requestedKind,
        offset: String(offset),
      })
      fetch(`/api/profile/${encodeURIComponent(accountId)}/timeline?${params}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Profile timeline request failed')
          const page = (await response.json()) as TimelineFeed
          if (!Array.isArray(page.tweets)) {
            throw new Error('Profile timeline response was invalid')
          }
          setFeeds((current) => {
            const previous =
              offset === 0 ? [] : (current[requestedKind]?.tweets ?? [])
            const seen = new Set(previous.map((tweet) => tweet.id))
            return {
              ...current,
              [requestedKind]: {
                tweets: [
                  ...previous,
                  ...page.tweets.filter((tweet) => !seen.has(tweet.id)),
                ],
                nextOffset: page.nextOffset,
                truncated: page.truncated === true,
              },
            }
          })
        })
        .catch(() => setFailed(true))
        .finally(() => {
          if (inFlight.current === requestKey) inFlight.current = null
          setLoading(false)
        })
    },
    [accountId],
  )

  const loadMore = useCallback(() => {
    if (!hasMore) return
    loadPage(kind, feed?.nextOffset ?? 0)
  }, [feed?.nextOffset, hasMore, kind, loadPage])

  useEffect(() => {
    const target = sentinelRef.current
    if (!target || !hasMore || loading || failed) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (feed) captureProductAction('profile_timeline', 'load_more')
          loadMore()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [failed, feed, hasMore, loadMore, loading])

  const selectKind = (next: ProfileTimelineKind) => {
    if (next === kind) return
    setKind(next)
    setFailed(false)
    captureProductAction('profile_timeline', 'filter_changed')
  }

  const tweets = feed?.tweets ?? []

  return (
    <section
      aria-labelledby={PROFILE_TIMELINE_HEADING_ID}
      className="flex flex-col gap-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={PROFILE_TIMELINE_HEADING_ID}
            className="scroll-mt-20 text-xl font-extrabold"
          >
            Latest posts
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Everything archived from this account, newest first.
          </p>
        </div>
        <div
          role="group"
          aria-label="Which posts to show"
          className="inline-flex rounded-full border border-border p-0.5 text-[13px]"
        >
          {(Object.keys(KIND_LABELS) as ProfileTimelineKind[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => selectKind(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                kind === option
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {KIND_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {tweets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {tweets.map((tweet) => (
            <div
              key={tweet.id}
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '0 160px',
              }}
            >
              <TweetCard
                tweet={
                  tweet.avatar ? tweet : { ...tweet, avatar: avatarUrl ?? null }
                }
                clickable
                collapsible
                showDate
                showExternalLink
                origin="profile"
                returnTo={returnTo}
              />
            </div>
          ))}
        </div>
      )}

      {feed && !hasMore && tweets.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
          {kind === 'original'
            ? 'No archived posts outside of replies.'
            : 'No archived posts yet.'}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-1">
          {failed ? (
            <button
              type="button"
              onClick={loadMore}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Retry loading posts
            </button>
          ) : (
            <span role="status" className="py-2 text-sm text-muted-foreground">
              {loading || !feed ? 'Loading posts…' : ' '}
            </span>
          )}
        </div>
      )}

      {feed && !hasMore && tweets.length > 0 && (
        <p className="py-2 text-center text-[13px] text-muted-foreground">
          {feed.truncated
            ? 'That’s as far back as this list goes. Pick a year on the left for older bangers, or search for older posts.'
            : 'That’s the oldest archived post.'}
        </p>
      )}
    </section>
  )
}
