'use client'

export type Grouping = 'tweets' | 'people'

/** Switches a set of tweets between one row per tweet and one per person. */
export function GroupingToggle({
  value,
  onChange,
  label,
}: {
  value: Grouping
  onChange: (value: Grouping) => void
  /** What is being grouped, for screen readers. */
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md border border-border p-0.5 text-sm"
    >
      {(['tweets', 'people'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`min-h-[2rem] rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === option
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option === 'tweets' ? 'Tweets' : 'People'}
        </button>
      ))}
    </div>
  )
}
