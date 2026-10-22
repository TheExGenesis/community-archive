'use client'

import { useState } from 'react'
import {
  Check,
  Download,
  Grid3x3,
  Link as LinkIcon,
  Share2,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/tailwind'

/**
 * The top-9 image, shown before it's saved: a bare download gives no sign
 * anything happened, and on a phone pressing the image saves it to photos.
 */
function Top9Dialog({
  open,
  onOpenChange,
  src,
  username,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  username: string
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const url = attempt ? `${src}&attempt=${attempt}` : src
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md gap-4 p-4 sm:p-5"
      >
        <DialogTitle className="pr-8 text-base">Top 9 image</DialogTitle>
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
          {state === 'failed' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              The image could not be made.
              <button
                type="button"
                onClick={() => {
                  setState('loading')
                  setAttempt((n) => n + 1)
                }}
                className="font-medium text-brand hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {state === 'loading' ? (
                <div className="absolute inset-0 animate-pulse bg-muted" />
              ) : null}
              {/* A generated PNG from our own route; next/image would only re-encode it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={url}
                src={url}
                alt={`The nine works @${username} tweeted about most`}
                onLoad={() => setState('ready')}
                onError={() => setState('failed')}
                className={cn(
                  'h-full w-full',
                  state === 'ready' ? '' : 'opacity-0',
                )}
              />
            </>
          )}
        </div>
        <a
          href={url}
          download={`${username}-top-9.png`}
          aria-disabled={state !== 'ready'}
          className={cn(
            buttonVariants(),
            'gap-2 rounded-full',
            state !== 'ready' && 'pointer-events-none opacity-50',
          )}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download
        </a>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Share a shelf: copy its link, post it on X (the link unfurls into the
 * shelf card), or save a top-9 image to post anywhere.
 */
export function ShelfShare({
  href,
  text,
  top9Href,
  username,
}: {
  href: string
  text: string
  top9Href: string
  username: string
}) {
  const [copied, setCopied] = useState(false)
  const [top9, setTop9] = useState(false)
  const absolute = () => new URL(href, window.location.origin).toString()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', absolute())
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Share2 aria-hidden="true" className="h-4 w-4" />
          )}
          {copied ? 'Link copied' : 'Share'}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={copy} className="gap-2.5 py-2">
            <LinkIcon
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              window.open(
                `https://x.com/intent/post?${new URLSearchParams({ text, url: absolute() })}`,
                '_blank',
                'noopener,noreferrer',
              )
            }
            className="gap-2.5 py-2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-muted-foreground"
            >
              <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58l11.09 14.47Z" />
            </svg>
            Post on X
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setTop9(true)}
            className="gap-2.5 py-2"
          >
            <Grid3x3
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
            Top 9 image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Top9Dialog
        open={top9}
        onOpenChange={setTop9}
        src={top9Href}
        username={username}
      />
    </>
  )
}
