'use client'

import { PiSortAscending, PiSortDescending } from 'react-icons/pi'
import type { ListSort, SortKey } from './listSort'

const LABELS: Record<SortKey, string> = {
  relevance: 'Relevance',
  count: 'Most tweets',
  date: 'Date',
}

/**
 * Sort options as quiet text links, the Bulletin's pattern: the chosen one
 * is bold, choosing it again reverses it, and the icon reverses too.
 */
export function SortLinks({
  options,
  value,
  onChange,
}: {
  options: SortKey[]
  value: ListSort
  onChange: (value: ListSort) => void
}) {
  const reverse = () => onChange({ ...value, ascending: !value.ascending })
  return (
    <div
      role="group"
      aria-label="Sort"
      className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
    >
      <button
        type="button"
        onClick={reverse}
        aria-label={`Order ${value.ascending ? 'ascending' : 'descending'}. Reverse`}
        title="Reverse order"
        className="inline-flex rounded p-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value.ascending ? (
          <PiSortAscending size={15} aria-hidden />
        ) : (
          <PiSortDescending size={15} aria-hidden />
        )}
      </button>
      {options.map((key, index) => {
        const active = value.key === key
        return (
          <span key={key} className="inline-flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">·</span>}
            <button
              type="button"
              aria-pressed={active}
              aria-label={`Sort by ${LABELS[key].toLowerCase()}${active ? `, ${value.ascending ? 'ascending' : 'descending'}` : ''}`}
              title={active ? 'Reverse order' : undefined}
              onClick={() =>
                active ? reverse() : onChange({ key, ascending: false })
              }
              className={`rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'font-semibold text-foreground'
                  : 'hover:text-foreground'
              }`}
            >
              {LABELS[key]}
            </button>
          </span>
        )
      })}
    </div>
  )
}
