import type { TrendGranularity } from '@/lib/portal/types'
import type { TrendRange } from '@/lib/portal/trendExplorerState'
import type { TimelinePreset } from '@/lib/portal/trendTimeline'
import { bucketLabel } from './model'
import { MUTED } from '../styles'

export function TimelineControls({
  buckets,
  granularity,
  range,
  preset,
  onPreset,
  onRange,
  disabled,
}: {
  buckets: string[]
  granularity: TrendGranularity
  range: TrendRange | null
  preset?: TimelinePreset
  onPreset: (preset: TimelinePreset | 'all') => void
  onRange: (range: TrendRange | null) => void
  disabled: boolean
}) {
  const allTime =
    !range && !preset && (granularity === 'year' || granularity === 'month')
  const start = range?.start ?? buckets[0] ?? ''
  const end = range?.end ?? buckets.at(-1) ?? ''
  return (
    <div className="border-b border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Timeline display"
      >
        <span className={`text-[11.5px] font-semibold ${MUTED}`}>Show</span>
        {(
          [
            ['all', 'All time'],
            ['12m', 'Last 12 months'],
            ['12w', 'Last 12 weeks'],
            ['15d', 'Last 15 days'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={value === 'all' ? allTime : preset === value}
            onClick={() => onPreset(value)}
            className={`rounded-[4px] border border-zinc-300 px-2 py-1 text-[11.5px] disabled:opacity-50 dark:border-[#34343a] ${preset === value || (value === 'all' && allTime) ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            {label}
          </button>
        ))}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {(['start', 'end'] as const).map((edge) => (
            <label key={edge} className={`text-[11px] ${MUTED}`}>
              {edge === 'start' ? 'From' : 'To'}
              <select
                aria-label={edge === 'start' ? 'Chart from' : 'Chart through'}
                disabled={disabled || !buckets.length}
                value={edge === 'start' ? start : end}
                onChange={(event) => {
                  const value = event.target.value
                  onRange(
                    edge === 'start'
                      ? { start: value, end: value > end ? value : end }
                      : { start: value < start ? value : start, end: value },
                  )
                }}
                className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
              >
                {buckets.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {bucketLabel(bucket, granularity)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      {(granularity === 'day' || granularity === 'week') && (
        <p className={`mt-2 text-[11px] ${MUTED}`}>
          {granularity === 'day'
            ? 'Daily detail is available for the last 90 days.'
            : 'Weekly detail is available for the last 52 weeks; weeks start on Monday.'}{' '}
          The current {granularity} is partial. Dates use UTC.
        </p>
      )}
    </div>
  )
}
