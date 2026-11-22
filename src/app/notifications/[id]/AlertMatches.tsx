'use client'

import { useEffect } from 'react'
import { TweetCard } from '@/components/TweetCard'
import {
  alertsRequest,
  announceSearchAlertsChanged,
} from '@/components/searchAlerts/client'
import type { PortalTweet } from '@/lib/portal/types'

/** Opening the page marks its notification read (from the client, so link prefetches do not). */
export function MarkNotificationRead({ id }: { id: string }) {
  useEffect(() => {
    void alertsRequest('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids: [id] }),
    })
      .then(announceSearchAlertsChanged)
      .catch(() => undefined)
  }, [id])
  return null
}

export function AlertMatches({
  items,
  highlightQuery,
  returnTo,
}: {
  items: Array<{ tweet: PortalTweet; parent: PortalTweet | null }>
  highlightQuery: string
  returnTo: string
}) {
  return (
    <ol className="space-y-3">
      {items.map(({ tweet, parent }) => (
        <li key={tweet.id} className="rounded-lg border border-border bg-card">
          {parent && (
            <div className="relative border-b border-border/70 pb-1 opacity-90">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Replying to
              </p>
              <TweetCard
                tweet={parent}
                compact
                collapsible
                showDate
                origin="search"
                returnTo={returnTo}
              />
            </div>
          )}
          <TweetCard
            tweet={tweet}
            compact
            collapsible
            showDate
            highlightQuery={highlightQuery}
            origin="search"
            returnTo={returnTo}
          />
        </li>
      ))}
    </ol>
  )
}
