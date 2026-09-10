'use client'

import { captureProductAction } from '@/lib/productAnalytics'
import { useState } from 'react'
import {
  monthlyActivity,
  yearlySummaries,
} from '@/lib/community-apps/birdseye-layout'
import type { BirdseyeCluster } from '@/lib/community-apps/types'
function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
export function MonthlyTimeline({ cluster }: { cluster: BirdseyeCluster }) {
  const [active, setActive] = useState<number | null>(null)
  const months = monthlyActivity(cluster.tweetIds)
  if (!months.length) return null
  const max = Math.max(1, ...months.map((month) => month.count))
  const summaries = yearlySummaries(cluster)
  const width = 640 / months.length
  const ticks = Array.from(
    new Set([
      0,
      ...months.flatMap((month, index) =>
        month.month.endsWith('-01') && index >= 7 && index < months.length - 7
          ? [index]
          : [],
      ),
      months.length - 1,
    ]),
  )
  return (
    <section aria-label="Topic timeline" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-lg font-bold">Through the years</h3>
        <p className="text-xs text-muted-foreground">
          {monthLabel(months[0].month)} —{' '}
          {monthLabel(months[months.length - 1].month)}
        </p>
      </div>
      <div className="relative" onMouseLeave={() => setActive(null)}>
        {active !== null && months[active] && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
            style={{
              left: `${Math.max(12, Math.min(88, ((active + 0.5) / months.length) * 100))}%`,
            }}
          >
            {monthLabel(months[active].month)} · {months[active].count}{' '}
            {months[active].count === 1 ? 'post' : 'posts'}
          </div>
        )}
        <svg
          viewBox="0 0 640 118"
          role="group"
          aria-label="Cited posts by month"
          className="h-24 w-full overflow-visible text-brand"
        >
          {months.map(({ month, count }, index) => (
            <g
              key={month}
              role="button"
              tabIndex={0}
              aria-label={`${monthLabel(month)}: ${count} cited posts`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              onClick={() => {
                captureProductAction('birdseye', 'filter_changed')
                setActive(index)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setActive(null)
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setActive(index)
                }
              }}
              className="outline-none"
            >
              <rect
                x={index * width}
                y={0}
                width={width}
                height={96}
                fill="transparent"
              />
              <title>{`${monthLabel(month)}: ${count} cited posts`}</title>
              <rect
                x={index * width + 0.5}
                y={94 - (count / max) * 85}
                width={Math.max(0.5, width - 1)}
                height={Math.max(0.75, (count / max) * 85)}
                rx={Math.min(2, width / 4)}
                fill="currentColor"
                opacity={active === index ? 1 : count ? 0.7 : 0.1}
              />
            </g>
          ))}
          {ticks.map((index) => (
            <text
              key={index}
              x={
                index === 0
                  ? 0
                  : index === months.length - 1
                    ? 640
                    : (index + 0.5) * width
              }
              y="113"
              fontSize="10"
              fill="currentColor"
              opacity="0.7"
              textAnchor={
                index === 0
                  ? 'start'
                  : index === months.length - 1
                    ? 'end'
                    : 'middle'
              }
            >
              {index === 0 || index === months.length - 1
                ? monthLabel(months[index].month)
                : months[index].month.slice(0, 4)}
            </text>
          ))}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        Monthly counts of cited posts, including conversation context. Empty
        months have no cited posts.
      </p>
      {summaries.length > 0 && (
        <div
          aria-label="Yearly summaries"
          className="birdseye-scroll flex snap-x gap-5 overflow-x-auto pb-3"
        >
          {summaries.map((item) => (
            <section
              key={item.label}
              className="w-64 shrink-0 snap-start border-t-2 border-brand/30 pt-3"
            >
              <h4 className="mb-2 font-sans text-lg font-bold text-brand">
                {item.label}
              </h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
