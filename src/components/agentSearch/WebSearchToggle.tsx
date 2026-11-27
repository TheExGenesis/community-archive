'use client'

import { Globe } from 'lucide-react'

/** Lets the member opt into web search alongside archive search. */
export function WebSearchToggle({
  value,
  onChange,
  compact = false,
}: {
  value: boolean
  onChange: (value: boolean) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label="Web search"
      title={
        value
          ? 'Web search on — can look up outside context alongside the archive'
          : 'Include web search alongside the archive'
      }
      onClick={() => onChange(!value)}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        compact ? 'px-2 sm:px-2.5' : 'px-2.5'
      } ${
        value
          ? 'border-brand/30 bg-brand/[0.07] font-medium text-brand-deep hover:bg-brand/[0.11] dark:border-brand/35 dark:bg-brand/10 dark:text-brand dark:hover:bg-brand/15'
          : 'border-border/80 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      }`}
    >
      <Globe
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${value ? 'text-brand/85' : ''}`}
      />
      <span className={compact ? 'hidden sm:inline' : undefined}>
        Web search
      </span>
    </button>
  )
}
