'use client'

import { RotateCcw } from 'lucide-react'
import { formatElapsed } from './messageView'

/**
 * Says plainly that an answer did not finish, so a turn with searches and
 * found posts but no answer text does not read as a broken answer.
 */
export function InterruptedNote({
  kind,
  elapsedMs,
  found,
  dailyLimit,
  onAskAgain,
  canAskAgain,
}: {
  kind: 'stopped' | 'failed'
  /** Known only for a run stopped in this visit. */
  elapsedMs: number | null
  found: number
  dailyLimit: number | null
  onAskAgain: () => void
  canAskAgain: boolean
}) {
  const what =
    kind === 'stopped'
      ? elapsedMs !== null
        ? `You stopped this answer after ${formatElapsed(elapsedMs)}.`
        : 'You stopped this answer.'
      : 'The answer stopped before it finished.'
  const foundLine =
    found > 0
      ? ` It had found ${found.toLocaleString('en-US')} ${
          found === 1 ? 'post' : 'posts'
        }; they’re below.`
      : ''
  return (
    <div
      role={kind === 'failed' ? 'alert' : 'status'}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-dashed border-border px-3 py-2.5"
    >
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="text-foreground">
          {what}
          {foundLine}
        </p>
        <p className="text-xs text-muted-foreground">
          {kind === 'stopped'
            ? `Stopped questions still count toward today’s ${dailyLimit ?? 10}.`
            : 'Asking again starts a new search.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onAskAgain}
        disabled={!canAskAgain}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Ask again
      </button>
    </div>
  )
}
