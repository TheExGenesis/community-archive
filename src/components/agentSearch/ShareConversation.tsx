'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Globe, Share2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { captureProductAction } from '@/lib/productAnalytics'
import { GHOST_BUTTON } from './ConversationHistory'

/** Where a shared conversation opens: the same page, by its id. */
export function shareUrl(conversationId: string) {
  return `${window.location.origin}/search/ask?c=${encodeURIComponent(
    conversationId,
  )}`
}

/** Shares or stops sharing; the error to show, or null when it worked. */
export type ShareChange = () => Promise<string | null>

const ACTION_BUTTON =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY = `${ACTION_BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`
const SECONDARY = `${ACTION_BUTTON} border border-border text-foreground hover:bg-accent`

/**
 * The asker's switch for a conversation: a popover that says what sharing
 * means, makes the link, copies it, and stops sharing. The page owns the
 * requests and the shared state; this only asks and shows the outcome.
 */
export function ShareConversation({
  conversationId,
  shared,
  onShare,
  onUnshare,
  disabled,
}: {
  conversationId: string
  shared: boolean
  onShare: ShareChange
  onUnshare: ShareChange
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const linkRef = useRef<HTMLInputElement>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )
  // Another conversation, or a fresh open: nothing copied, nothing wrong.
  useEffect(() => {
    setCopied(false)
    setError(null)
  }, [conversationId, open])

  const change = async (run: ShareChange, action: 'shared' | 'unshared') => {
    setBusy(true)
    setError(null)
    try {
      const failure = await run()
      if (failure) setError(failure)
      else captureProductAction('ask_archive', action)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    const url = shareUrl(conversationId)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // No clipboard (an insecure context, a denied permission): the link
      // is selected for the reader to copy themself.
      linkRef.current?.select()
      setError('Copy the link from the box above.')
      return
    }
    captureProductAction('ask_archive', 'link_copied')
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={GHOST_BUTTON}
          aria-label={shared ? 'Sharing: anyone with the link' : 'Share'}
        >
          {shared ? (
            <Globe aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Share2 aria-hidden="true" className="h-4 w-4" />
          )}
          {shared ? 'Shared' : 'Share'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Share this conversation"
        className="w-[min(22rem,calc(100vw-2rem))] p-4"
      >
        <p className="text-sm font-semibold text-foreground">
          {shared
            ? 'Anyone with the link can read this'
            : 'Share this conversation'}
        </p>
        {shared ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <input
                ref={linkRef}
                readOnly
                aria-label="Link to this conversation"
                value={shareUrl(conversationId)}
                onFocus={(event) => event.target.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-muted px-2.5 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" onClick={copy} className={PRIMARY}>
                {copied ? (
                  <Check aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Copy aria-hidden="true" className="h-4 w-4" />
                )}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Readers see the questions and answers, with the tweets they cite,
              but not who asked. Follow-ups you add are shared too.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => change(onUnshare, 'unshared')}
              className={`${SECONDARY} mt-3`}
            >
              {busy ? 'Stopping…' : 'Stop sharing'}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Anyone with the link can read it, signed in or not: the questions
              and answers, with the tweets they cite. It does not show who
              asked. Follow-ups you add later are shared too, and you can stop
              sharing at any time.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => change(onShare, 'shared')}
              className={`${PRIMARY} mt-3`}
            >
              {busy ? 'Creating link…' : 'Create link'}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
