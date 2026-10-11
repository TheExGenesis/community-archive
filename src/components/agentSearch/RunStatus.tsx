'use client'

import { useEffect, useState } from 'react'
import { Loader2, Square } from 'lucide-react'
import { formatElapsed } from './messageView'

/** After this long the row says so and points at Stop. */
const SLOW_MS = 90_000

/**
 * The one line that says a question is being worked on: what is happening,
 * for how long, how much it has found, and the way to stop it.
 */
export function RunStatus({
  startedAt,
  found,
  writing,
  onStop,
}: {
  /** Client clock when the question was sent or the run was reopened. */
  startedAt: number
  found: number
  /** The answer text has started. */
  writing: boolean
  onStop: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, now - startedAt)
  const slow = elapsed >= SLOW_MS

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Loader2
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          <span aria-live="polite">
            {writing ? 'Writing the answer' : 'Searching the archive'}
          </span>
          <span
            aria-label={`${Math.floor(elapsed / 1000)} seconds`}
            className="font-normal tabular-nums text-muted-foreground"
          >
            · {formatElapsed(elapsed)}
          </span>
        </p>
        <p className="pl-6 text-xs text-muted-foreground">
          {found > 0 && (
            <span className="text-foreground">
              Found {found.toLocaleString('en-US')}{' '}
              {found === 1 ? 'post' : 'posts'} so far.{' '}
            </span>
          )}
          {slow
            ? 'Taking longer than usual. You can stop it and keep what it found.'
            : 'Most answers take 30 to 60 seconds.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onStop}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Square aria-hidden="true" className="h-3.5 w-3.5" />
        Stop
      </button>
    </div>
  )
}
