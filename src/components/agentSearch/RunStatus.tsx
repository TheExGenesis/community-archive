'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Square } from 'lucide-react'
import { formatElapsed, type ProgressLine } from './messageView'

/** After this long the indicator says so and points at Stop. */
const SLOW_MS = 90_000

/**
 * What a question is doing while it runs: how long it has been going, each
 * step the agent has taken (done, failed or under way), and the way to stop
 * it. The steps are the indicator; afterwards How this was searched covers
 * the same ground under the answer.
 */
export function RunStatus({
  startedAt,
  found,
  writing,
  steps = [],
  onStop,
}: {
  /** Client clock when the question was sent or the run was reopened. */
  startedAt: number
  found: number
  /** The answer text has started. */
  writing: boolean
  /** The agent's tool calls so far. */
  steps?: ProgressLine[]
  onStop: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, now - startedAt)
  const slow = elapsed >= SLOW_MS

  // Something is always shown as under way: the question before the first
  // tool call, and the answer once the model writes with no tool running.
  const lines = [...steps]
  if (lines.length === 0) {
    lines.push({
      id: 'reading',
      status: 'running',
      text: 'Reading the question',
    })
  } else if (writing && !lines.some((line) => line.status === 'running')) {
    lines.push({ id: 'writing', status: 'running', text: 'Writing the answer' })
  }

  return (
    // Stop lines up with the answer column, not the cited rail beside it.
    <div className="space-y-2 lg:mr-[23rem]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-foreground">
          Working
          <span
            aria-label={`${Math.floor(elapsed / 1000)} seconds`}
            className="font-normal tabular-nums text-muted-foreground"
          >
            {' '}
            · {formatElapsed(elapsed)}
          </span>
          {found > 0 && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {found.toLocaleString('en-US')} {found === 1 ? 'post' : 'posts'}{' '}
              found
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onStop}
          className="-mr-2 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Square aria-hidden="true" className="h-3 w-3 fill-current" />
          Stop
        </button>
      </div>
      <ol
        aria-live="polite"
        aria-label="Search progress"
        className="space-y-1.5 text-sm text-muted-foreground"
      >
        {lines.map((line) => (
          <li key={line.id} className="flex items-start gap-2">
            {line.status === 'running' ? (
              <Loader2
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground motion-reduce:animate-none"
              />
            ) : line.status === 'error' ? (
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              />
            ) : (
              <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span
              className={`min-w-0 break-words ${
                line.status === 'running' ? 'text-foreground' : ''
              }`}
            >
              {line.text}
            </span>
          </li>
        ))}
      </ol>
      {slow && (
        <p className="text-xs text-muted-foreground">
          {found > 0
            ? `Taking longer than usual. If you stop now, the ${found.toLocaleString(
                'en-US',
              )} ${found === 1 ? 'post' : 'posts'} found so far stay on the page.`
            : 'Taking longer than usual.'}
        </p>
      )}
    </div>
  )
}
