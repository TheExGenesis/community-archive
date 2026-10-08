'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
import {
  SHELF_COVER_SIZE,
  SHELF_MARK_LABEL,
  shelfHost,
  shelfSpan,
} from '@/lib/shelf/labels'
import type { ShelfItem } from '@/lib/shelf/types'
import { ShelfCover } from './ShelfCover'
import { ShelfMarks } from './ShelfMarks'

type Evidence =
  | { state: 'loading' }
  | { state: 'ready'; tweets: PortalTweet[]; total: number }
  | { state: 'error'; message: string }

/** One work, its marks, and the tweets it was found in. */
export function ShelfItemDrawer({
  accountId,
  item,
  onClose,
  actions,
}: {
  accountId: string
  item: ShelfItem | null
  onClose: () => void
  actions?: ReactNode
}) {
  const cache = useRef(new Map<string, Evidence>())
  const [evidence, setEvidence] = useState<Evidence>({ state: 'loading' })

  useEffect(() => {
    if (!item) return
    const url = `/api/shelf/evidence?${new URLSearchParams({ account_id: accountId, key: item.key })}`
    const cached = cache.current.get(url)
    if (cached) {
      setEvidence(cached)
      return
    }
    let live = true
    setEvidence({ state: 'loading' })
    fetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(body?.tweets))
          throw new Error(
            typeof body?.error === 'string'
              ? body.error
              : 'Source tweets are unavailable. Try again.',
          )
        const next: Evidence = {
          state: 'ready',
          tweets: body.tweets,
          total: body.total ?? body.tweets.length,
        }
        cache.current.set(url, next)
        if (live) setEvidence(next)
      })
      .catch((error: Error) => {
        if (live) setEvidence({ state: 'error', message: error.message })
      })
    return () => {
      live = false
    }
  }, [accountId, item])

  const size = item ? SHELF_COVER_SIZE[item.row] : { w: 0, h: 0 }
  const scale = item ? Math.min(1.25, 200 / size.h) : 1
  const host = item ? shelfHost(item.url) : null

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-card p-0 sm:max-w-lg"
      >
        {item ? (
          <div className="flex flex-col">
            <div className="flex gap-4 border-b border-border p-5 pr-12">
              <ShelfCover
                item={item}
                width={Math.round(size.w * Math.min(scale, 1))}
                height={Math.round(size.h * Math.min(scale, 1))}
              />
              <div className="min-w-0 self-end">
                <SheetTitle className="font-serif text-xl font-semibold leading-snug [overflow-wrap:anywhere]">
                  {item.label}
                </SheetTitle>
                {item.creator ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.creator}
                  </p>
                ) : null}
                <SheetDescription className="mt-2 text-xs text-muted-foreground">
                  {item.medium}, tweeted about {shelfSpan(item)}
                </SheetDescription>
                {host ? (
                  <a
                    href={item.url!}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Open on {host}
                  </a>
                ) : null}
              </div>
            </div>

            {item.marks.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-sm">
                {item.marks.map((mark) => (
                  <li key={mark} className="flex items-center gap-1.5">
                    <ShelfMarks marks={[mark]} />
                    {SHELF_MARK_LABEL[mark]}
                  </li>
                ))}
              </ul>
            ) : null}

            {actions ? (
              <div className="border-b border-border px-5 py-3">{actions}</div>
            ) : null}

            <section className="px-5 py-4" aria-live="polite">
              <h3 className="text-sm font-semibold">
                {item.evidenceTweetIds.length === 1
                  ? 'The tweet'
                  : `The ${item.evidenceTweetIds.length} tweets`}
              </h3>
              {evidence.state === 'loading' ? (
                <div className="mt-3 space-y-3">
                  {[0, 1].map((n) => (
                    <div
                      key={n}
                      className="h-24 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : evidence.state === 'error' ? (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {evidence.message}
                </p>
              ) : evidence.tweets.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  These tweets are not in the archive right now.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {evidence.tweets.map((tweet) => (
                    <TweetCard
                      key={tweet.id}
                      tweet={tweet}
                      showDate
                      collapsible
                      constrainMedia
                      origin="profile"
                    />
                  ))}
                  {evidence.total > evidence.tweets.length ? (
                    <p className="text-xs text-muted-foreground">
                      Showing the {evidence.tweets.length} most recent of{' '}
                      {evidence.total}.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
