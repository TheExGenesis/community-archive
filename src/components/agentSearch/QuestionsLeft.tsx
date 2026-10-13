'use client'

import { KeyRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { OwnKeyControl } from './OwnKeyControl'

export interface QuestionsToday {
  limit: number
  remaining: number
  /** Local time the count starts over, e.g. "8:00 AM". */
  resetLabel: string
  /** The questions are on the member's own key. */
  ownKey: boolean
  /** Whether the member may add a key at all. */
  ownKeyEnabled: boolean
  /** Questions a day on one's own key. */
  ownLimit: number | null
}

/**
 * "N left today", which opens to what the count means and the one thing
 * that changes it: the member's own OpenRouter key. The same control lives
 * in Settings, where the popover links.
 */
export function QuestionsLeft({
  today,
  trigger,
  className = '',
}: {
  today: QuestionsToday
  /** Opens the popover in place of the count, e.g. once none are left. */
  trigger?: ReactNode
  className?: string
}) {
  const used = Math.max(0, today.limit - today.remaining)
  const label =
    trigger ?? `${today.remaining.toLocaleString('en-US')} left today`
  if (!today.ownKeyEnabled) {
    return <span className={`tabular-nums ${className}`}>{label}</span>
  }
  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1 rounded-sm tabular-nums underline decoration-transparent underline-offset-2 transition-colors hover:text-foreground hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        {today.ownKey && !trigger && (
          <KeyRound aria-label="On your key" className="h-3.5 w-3.5" />
        )}
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm text-muted-foreground">
          {used.toLocaleString('en-US')} of{' '}
          {today.limit.toLocaleString('en-US')} questions used today
          {today.ownKey ? ' on your key' : ''}. The count starts over at{' '}
          {today.resetLabel}.
        </p>
        <OwnKeyControl ownLimit={today.ownLimit} />
        <Link
          href="/settings#ask-archive"
          className="inline-block rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Settings
        </Link>
      </PopoverContent>
    </Popover>
  )
}
