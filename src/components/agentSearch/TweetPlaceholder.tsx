'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { TweetLoad } from './messageView'

export const RETRY_BUTTON =
  'rounded-sm underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** What a tweet that is not in hand says for itself, by state. */
export function tweetLoadText(state: TweetLoad): string {
  switch (state) {
    case 'loading':
      return 'Loading this tweet'
    case 'failed':
      return 'Couldn’t load this tweet'
    case 'unavailable':
      return 'This tweet is no longer available'
  }
}

/**
 * Holds a tweet's place in a card, rail item or embed while a reopened
 * conversation fetches it: a skeleton while loading, the reason once it
 * cannot be shown. Failed fetches offer Retry; a tweet the gateway no longer
 * returns (deleted, or its author opted out) says so, which is not the same
 * as an unverified citation.
 */
export function TweetPlaceholder({
  state,
  onRetry,
  compact = false,
}: {
  state: TweetLoad
  onRetry?: () => void
  /** A rail item or row, not a full card. */
  compact?: boolean
}) {
  const padding = compact ? 'px-4 py-3' : 'px-4 py-4'
  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label={tweetLoadText(state)}
        className={`space-y-2 ${padding}`}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-4 w-full" />
        {!compact && <Skeleton className="h-4 w-5/6" />}
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }
  return (
    <p className={`text-sm text-muted-foreground ${padding}`}>
      {tweetLoadText(state)}
      {state === 'failed' && onRetry && (
        <>
          {' '}
          <span aria-hidden="true">·</span>{' '}
          <button type="button" onClick={onRetry} className={RETRY_BUTTON}>
            Retry
          </button>
        </>
      )}
      {state === 'unavailable' && (
        <span className="block text-xs">
          It was deleted, or its author has opted out of the archive.
        </span>
      )}
    </p>
  )
}
