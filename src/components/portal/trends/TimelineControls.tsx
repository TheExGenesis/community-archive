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
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-[#202023] sm:px-5">
      <div
        className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
        role="group"
        aria-label="Timeline display"
      >
        {(
          [
            ['all', 'All time'],
            ['12m', 'Last 12 months'],
            ['12w', 'Last 12 weeks'],
            ['15d', 'Last 15 days'],
          ] as const
        ).map(([value, label]) => {
          const active = value === 'all' ? allTime : preset === value
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onPreset(value)}
              className={`whitespace-nowrap rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : `${MUTED} hover:text-foreground`}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {(['start', 'end'] as const).map((edge) => (
          <label
            key={edge}
            className={`inline-flex items-center whitespace-nowrap text-[11px] font-semibold ${MUTED}`}
          >
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
              className="ml-1.5 h-7 rounded-[4px] border border-zinc-300 bg-white px-2 text-[12px] font-normal text-foreground dark:border-[#34343a] dark:bg-[#121214]"
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
  )
}

export function timelineNote(granularity: TrendGranularity): string | null {
  if (granularity === 'day')
    return 'Daily detail covers the last 90 days; today is partial.'
  if (granularity === 'week')
    return 'Weekly detail covers the last 52 weeks, starting Mondays; this week is partial.'
  return null
}
