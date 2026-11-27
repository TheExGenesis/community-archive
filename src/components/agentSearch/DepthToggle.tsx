'use client'

import type { AgentSearchDepth } from '@/lib/agentSearch/depth'

const OPTIONS: ReadonlyArray<{
  depth: AgentSearchDepth
  label: string
  hint: string
}> = [
  { depth: 'fast', label: 'Fast', hint: 'A quick pass over the archive' },
  { depth: 'deep', label: 'Deep', hint: 'A longer, more thorough search' },
]

/** How hard the next question is searched: a quick pass, or the long search. */
export function DepthToggle({
  value,
  onChange,
}: {
  value: AgentSearchDepth
  onChange: (value: AgentSearchDepth) => void
}) {
  return (
    <div
      role="group"
      aria-label="Search depth"
      className="inline-flex shrink-0 rounded-[8px] border border-border/80 p-0.5 text-xs"
    >
      {OPTIONS.map(({ depth, label, hint }) => (
        <button
          key={depth}
          type="button"
          aria-pressed={value === depth}
          title={hint}
          onClick={() => onChange(depth)}
          className={`h-7 rounded-[6px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === depth
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
