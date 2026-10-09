'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Citation } from './messageView'

const NAV =
  'inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Phones: a tapped citation opens its post in a sheet over the answer, so
 * the reader checks it without losing their place, then steps to the
 * neighbouring citations or closes it.
 */
export function CitationSheet({
  citations,
  anchor,
  onNavigate,
  onClose,
  returnFocusTo,
}: {
  citations: Citation[]
  /** The open citation, or null when the sheet is closed. */
  anchor: string | null
  onNavigate: (anchor: string) => void
  onClose: () => void
  /** The chip that opened the sheet; focus goes back to it on close. */
  returnFocusTo: HTMLElement | null
}) {
  const index = citations.findIndex((citation) => citation.anchor === anchor)
  const citation = index >= 0 ? citations[index] : null
  const previous = index > 0 ? citations[index - 1] : null
  const next =
    index >= 0 && index < citations.length - 1 ? citations[index + 1] : null

  return (
    <Sheet open={Boolean(citation)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[75vh] flex-col gap-3 rounded-t-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
        onOpenAutoFocus={(event) => {
          // The sheet itself, not the post's first button (its like count).
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
        onCloseAutoFocus={(event) => {
          // Back to the chip, without scrolling the answer.
          event.preventDefault()
          returnFocusTo?.focus({ preventScroll: true })
        }}
      >
        {citation && (
          <>
            <div className="pr-8">
              <SheetTitle className="text-sm font-semibold">
                Citation {citation.n}{' '}
                <span className="font-normal text-muted-foreground">
                  of {citations.length}
                </span>
              </SheetTitle>
              <SheetDescription className="sr-only">
                The post this citation points to.
              </SheetDescription>
            </div>
            <div className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-border">
              <TweetCard
                key={citation.id}
                tweet={citation.tweet}
                stacked
                showDate
                showExternalLink
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!previous}
                onClick={() => previous && onNavigate(previous.anchor)}
                className={NAV}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={!next}
                onClick={() => next && onNavigate(next.anchor)}
                className={NAV}
              >
                Next
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
