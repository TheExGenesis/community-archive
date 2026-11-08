'use client'

import { useState } from 'react'
import { SERIES_COLORS } from '@/components/portal/trends/config'
import type { TrendStorySeries } from '@/lib/trendStories/core'

const W = 720
const H = 190
const PAD = { top: 12, right: 12, bottom: 24, left: 40 }

const short = (day: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

const niceMax = (value: number) => {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

/**
 * Daily share of tweets (per 100k) for a story's terms, with the trend's
 * seven-day window shaded.
 */
export default function TrendStoryChart({
  data,
  windowSince,
  windowUntil,
}: {
  data: TrendStorySeries
  windowSince: string
  windowUntil: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const { days, series } = data
  if (days.length < 2) return null
  const max = niceMax(Math.max(...series.flatMap((item) => item.perBucket)))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (index: number) => PAD.left + (index / (days.length - 1)) * innerW
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH
  const windowStart = days.findIndex((day) => day >= windowSince)
  let windowEnd = days.findLastIndex((day) => day <= windowUntil)
  if (windowEnd < 0) windowEnd = days.length - 1
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(days.length / 6)
  const color = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length]
  const hoverDay = hover === null ? null : days[hover]

  return (
    <figure className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-[13px] font-semibold text-foreground">
          {series.length === 1 ? `“${series[0].term}”` : 'Terms'} per 100k
          tweets, by day
        </figcaption>
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {series.map((item, index) => (
              <li key={item.term} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-3.5 rounded"
                  style={{ background: color(index) }}
                />
                {item.term}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={`Daily share of tweets mentioning ${series.map((item) => item.term).join(', ')} from ${short(days[0])} to ${short(days.at(-1)!)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const px = ((event.clientX - box.left) / box.width) * W
            const index = Math.round(
              ((px - PAD.left) / innerW) * (days.length - 1),
            )
            setHover(Math.max(0, Math.min(days.length - 1, index)))
          }}
        >
          {windowStart >= 0 ? (
            <g>
              <rect
                x={x(windowStart)}
                y={PAD.top}
                width={Math.max(2, x(windowEnd) - x(windowStart))}
                height={innerH}
                className="fill-zinc-100 dark:fill-[#1f1f23]"
              />
              <text
                x={x(windowStart) + 6}
                y={PAD.top + 12}
                className="fill-zinc-500 text-[10.5px] dark:fill-zinc-400"
              >
                Trend week
              </text>
            </g>
          ) : null}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-zinc-200 dark:stroke-[#2a2a2f]"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(tick) + 3.5}
                textAnchor="end"
                className="fill-zinc-500 text-[10.5px] tabular-nums dark:fill-zinc-400"
              >
                {tick.toLocaleString('en-US', { maximumFractionDigits: 1 })}
              </text>
            </g>
          ))}
          {days.map((day, index) =>
            index % labelEvery === 0 ? (
              <text
                key={day}
                x={x(index)}
                y={H - 6}
                textAnchor="middle"
                className="fill-zinc-500 text-[10.5px] dark:fill-zinc-400"
              >
                {short(day)}
              </text>
            ) : null,
          )}
          {series.map((item, index) => (
            <polyline
              key={item.term}
              fill="none"
              stroke={color(index)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={item.perBucket
                .map((value, day) => `${x(day)},${y(value)}`)
                .join(' ')}
            />
          ))}
          {hover !== null ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeWidth={1}
              />
              {series.map((item, index) => (
                <circle
                  key={item.term}
                  cx={x(hover)}
                  cy={y(item.perBucket[hover])}
                  r={4}
                  fill={color(index)}
                  className="stroke-white dark:stroke-[#111114]"
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}
        </svg>
        {hover !== null && hoverDay ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12px] shadow-sm dark:border-[#2a2a2f] dark:bg-[#18181b]"
            style={{
              left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%`,
            }}
          >
            <div className="font-semibold text-foreground">
              {short(hoverDay)}
            </div>
            {series.map((item, index) => (
              <div
                key={item.term}
                className="mt-1 flex items-center gap-1.5 text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ background: color(index) }}
                />
                <span className="whitespace-nowrap text-foreground">{item.term}</span>
                <span className="ml-auto whitespace-nowrap pl-3 tabular-nums">
                  {item.tweets[hover].toLocaleString('en-US')} tweets ·{' '}
                  {item.perBucket[hover].toLocaleString('en-US', {
                    maximumFractionDigits: 1,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  )
}
