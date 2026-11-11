'use client'

import { useAskShortcutLabel } from '@/lib/useAskShortcutLabel'

/**
 * A small "Ask AI ⌘↵" chip for search boxes: the shortcut that hands the text
 * to Ask the archive instead of searching, and a button for those who click.
 */
export function AskShortcutChip({
  onAsk,
  className = '',
}: {
  onAsk: () => void
  className?: string
}) {
  const key = useAskShortcutLabel()
  return (
    <button
      type="button"
      onClick={onAsk}
      title="Ask the archive: reads the tweets and writes a cited answer"
      aria-label="Ask the archive instead"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      <span>Ask AI</span>
      <kbd className="font-sans opacity-70">{key}↵</kbd>
    </button>
  )
}
