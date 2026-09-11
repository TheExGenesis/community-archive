'use client'

import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { TrendBucketSeries, TrendGranularity } from '@/lib/portal/types'
import type {
  TrendRange,
  TrendExplorerUrlState,
} from '@/lib/portal/trendExplorerState'
import { bucketLabel } from './model'
import type { CaptureExplorerAction } from './config'
import { MUTED } from '../styles'

const compactAxisFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const plainAxisFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
})
function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function compactAxis(value: number): string {
  return (value >= 1_000 ? compactAxisFormatter : plainAxisFormatter).format(
    value,
  )
}

export function TrendChart({
  buckets,
  enabledSeries,
  granularity,
  scale,
  axis = 'linear',
  selectedRange,
  setSelectedRange,
  isLoadingSeries,
  seriesCount,
  captureExplorerAction,
  onSelectingRangeChange,
}: {
  buckets: string[]
  enabledSeries: TrendBucketSeries[]
  granularity: TrendGranularity
  scale: TrendExplorerUrlState['scale']
  axis?: 'linear' | 'log'
  selectedRange: TrendRange | null
  setSelectedRange: Dispatch<SetStateAction<TrendRange | null>>
  isLoadingSeries: boolean
  seriesCount: number
  captureExplorerAction: CaptureExplorerAction
  onSelectingRangeChange: (selecting: boolean) => void
}) {
  const chartRef = useRef<SVGSVGElement>(null)
  const [dragStartBucket, setDragStartBucket] = useState<string | null>(null)
  const valuesFor = (item: TrendBucketSeries) =>
    scale === 'normalized' ? item.perBucket : item.tweetsPerBucket
  const maxValue = Math.max(
    1,
    ...enabledSeries.flatMap((item) => valuesFor(item)),
  )
  const chartMax = niceCeiling(maxValue)
  const gridValues =
    axis === 'log'
      ? [
          0,
          ...Array.from(
            { length: Math.ceil(Math.log10(chartMax)) + 1 },
            (_, i) => 10 ** i,
          ).filter((value) => value < chartMax),
          chartMax,
        ]
      : [0, chartMax / 4, chartMax / 2, (chartMax * 3) / 4, chartMax]
  const W = 760
  const H = 360
  const X0 = 62
  const X1 = 732
  const Y0 = 326
  const Y1 = 24
  const xPositions = buckets.map(
    (_, index) => X0 + (index * (X1 - X0)) / Math.max(buckets.length - 1, 1),
  )
  const axisTickIndexes = buckets
    .map((_, index) => index)
    .filter(
      (index) =>
        granularity === 'year' ||
        index === 0 ||
        index === buckets.length - 1 ||
        index % 12 === 0,
    )
  const yPosition = (value: number) =>
    Y0 -
    (axis === 'log'
      ? Math.log1p(value) / Math.log1p(chartMax)
      : value / chartMax) *
      (Y0 - Y1)
  const selectedStartIndex = selectedRange
    ? buckets.indexOf(selectedRange.start)
    : -1
  const selectedEndIndex = selectedRange
    ? buckets.indexOf(selectedRange.end)
    : -1
  const bucketForPointer = (clientX: number): string | null => {
    const svg = chartRef.current
    if (!svg || buckets.length === 0) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const svgX = ((clientX - rect.left) / rect.width) * W
    const ratio = Math.max(0, Math.min(1, (svgX - X0) / (X1 - X0)))
    const index = Math.round(ratio * Math.max(buckets.length - 1, 0))
    return buckets[index] ?? null
  }

  const updateDraggedRange = (bucket: string, anchor = dragStartBucket) => {
    if (anchor === null) return
    setSelectedRange({
      start: anchor < bucket ? anchor : bucket,
      end: anchor > bucket ? anchor : bucket,
    })
  }

  const beginRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    const bucket = bucketForPointer(event.clientX)
    if (bucket === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragStartBucket(bucket)
    onSelectingRangeChange(true)
  }

  const continueRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartBucket === null) return
    const bucket = bucketForPointer(event.clientX)
    if (bucket !== null && bucket !== dragStartBucket) {
      updateDraggedRange(bucket)
    }
  }

  const finishRangeSelection = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragStartBucket === null) return
    const bucket = bucketForPointer(event.clientX)
    if (bucket !== null && bucket !== dragStartBucket) {
      updateDraggedRange(bucket)
      captureExplorerAction('year_filter_applied', { hasYearFilter: true })
    }
    setDragStartBucket(null)
    onSelectingRangeChange(false)
  }

  return (
    <>
      <div className="px-2 pb-1 pt-3 sm:px-4">
        <svg
          ref={chartRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={`${granularity === 'year' ? 'Yearly' : 'Monthly'} term trends shown as ${scale === 'normalized' ? 'occurrences per 100,000 tweets' : 'raw tweet counts'}${axis === 'log' ? ' on a logarithmic axis' : ''}`}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={X0 - 5}
                y1={yPosition(value)}
                x2={X1}
                y2={yPosition(value)}
                className="stroke-zinc-200 dark:stroke-[#202023]"
                strokeWidth={1}
              />
              <text
                x={X0 - 10}
                y={yPosition(value) + 4}
                textAnchor="end"
                fontSize={10}
                className="fill-zinc-400 dark:fill-[#6d6d78]"
              >
                {compactAxis(value)}
              </text>
            </g>
          ))}
          {axisTickIndexes.map((index) => (
            <text
              key={buckets[index]}
              x={xPositions[index]}
              y={350}
              textAnchor="middle"
              fontSize={11}
              className="fill-zinc-400 dark:fill-[#6d6d78]"
            >
              {bucketLabel(buckets[index], granularity)}
            </text>
          ))}
          {enabledSeries.map((item) => {
            const values = valuesFor(item)
            return (
              <g key={item.term}>
                <polyline
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={values
                    .map(
                      (value, index) =>
                        `${xPositions[index]},${yPosition(value).toFixed(1)}`,
                    )
                    .join(' ')}
                />
                {values.map((value, index) => (
                  <circle
                    key={buckets[index]}
                    cx={xPositions[index]}
                    cy={yPosition(value)}
                    r={3}
                    fill={item.color}
                    className="stroke-white dark:stroke-[#1b1b1e]"
                    strokeWidth={1.5}
                    aria-label={`${item.term} · ${bucketLabel(buckets[index], granularity)} · ${
                      scale === 'normalized'
                        ? `${compactAxis(value)} per 100k`
                        : `${Math.round(value).toLocaleString('en-US')} tweets`
                    }`}
                  />
                ))}
              </g>
            )
          })}
          {enabledSeries.length === 0 && (
            <text
              x={(X0 + X1) / 2}
              y={(Y0 + Y1) / 2}
              textAnchor="middle"
              fontSize={13}
              className="fill-zinc-400 dark:fill-[#6d6d78]"
            >
              {isLoadingSeries
                ? `Loading ${granularity === 'month' ? 'monthly' : 'yearly'} trends…`
                : seriesCount === 0
                  ? 'Add a trend above to start charting.'
                  : 'Select a trend below to draw it.'}
            </text>
          )}
          {selectedRange &&
            selectedStartIndex >= 0 &&
            selectedEndIndex >= 0 && (
              <rect
                x={Math.max(
                  X0,
                  xPositions[selectedStartIndex] -
                    (xPositions[1] - xPositions[0] || 16) / 2,
                )}
                y={Y1}
                width={
                  Math.min(
                    X1,
                    xPositions[selectedEndIndex] +
                      (xPositions[1] - xPositions[0] || 16) / 2,
                  ) -
                  Math.max(
                    X0,
                    xPositions[selectedStartIndex] -
                      (xPositions[1] - xPositions[0] || 16) / 2,
                  )
                }
                height={Y0 - Y1}
                className="pointer-events-none fill-blue-500/10 stroke-blue-500/60"
                strokeWidth={1}
              />
            )}
          <rect
            x={X0}
            y={Y1}
            width={X1 - X0}
            height={Y0 - Y1}
            fill="transparent"
            className="cursor-crosshair"
            aria-label={`Drag horizontally to filter tweets by ${granularity}`}
            onPointerDown={beginRangeSelection}
            onPointerMove={continueRangeSelection}
            onPointerUp={finishRangeSelection}
            onPointerCancel={() => {
              setDragStartBucket(null)
              onSelectingRangeChange(false)
            }}
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
        <span className={`mr-auto text-[11.5px] ${MUTED}`}>
          Drag across the chart to filter tweets by {granularity}. Clicking
          alone keeps the current range.
        </span>
        {granularity === 'year' ? (
          <>
            <label className={`text-[11px] font-semibold ${MUTED}`}>
              From
              <select
                aria-label="Tweets from year"
                value={selectedRange?.start ?? ''}
                onChange={(event) => {
                  if (!event.target.value) {
                    captureExplorerAction('year_filter_cleared', {
                      hasYearFilter: false,
                    })
                    setSelectedRange(null)
                    return
                  }
                  const start = event.target.value
                  captureExplorerAction('year_filter_applied', {
                    hasYearFilter: true,
                  })
                  setSelectedRange((current) => ({
                    start,
                    end: current && current.end >= start ? current.end : start,
                  }))
                }}
                className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
              >
                <option value="">Any</option>
                {buckets.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {bucket}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-[11px] font-semibold ${MUTED}`}>
              To
              <select
                aria-label="Tweets through year"
                value={selectedRange?.end ?? ''}
                onChange={(event) => {
                  if (!event.target.value) {
                    captureExplorerAction('year_filter_cleared', {
                      hasYearFilter: false,
                    })
                    setSelectedRange(null)
                    return
                  }
                  const end = event.target.value
                  captureExplorerAction('year_filter_applied', {
                    hasYearFilter: true,
                  })
                  setSelectedRange((current) => ({
                    start:
                      current && current.start <= end ? current.start : end,
                    end,
                  }))
                }}
                className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
              >
                <option value="">Any</option>
                {buckets.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {bucket}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className={`text-[11px] font-semibold ${MUTED}`}>
              From
              <input
                type="month"
                aria-label="Tweets from month"
                min={buckets[0]}
                max={buckets.at(-1)}
                value={selectedRange?.start ?? ''}
                onChange={(event) => {
                  const start = event.target.value
                  if (!start) {
                    captureExplorerAction('year_filter_cleared', {
                      hasYearFilter: false,
                    })
                    setSelectedRange(null)
                    return
                  }
                  captureExplorerAction('year_filter_applied', {
                    hasYearFilter: true,
                  })
                  setSelectedRange((current) => ({
                    start,
                    end: current && current.end >= start ? current.end : start,
                  }))
                }}
                className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
              />
            </label>
            <label className={`text-[11px] font-semibold ${MUTED}`}>
              To
              <input
                type="month"
                aria-label="Tweets through month"
                min={buckets[0]}
                max={buckets.at(-1)}
                value={selectedRange?.end ?? ''}
                onChange={(event) => {
                  const end = event.target.value
                  if (!end) {
                    captureExplorerAction('year_filter_cleared', {
                      hasYearFilter: false,
                    })
                    setSelectedRange(null)
                    return
                  }
                  captureExplorerAction('year_filter_applied', {
                    hasYearFilter: true,
                  })
                  setSelectedRange((current) => ({
                    start:
                      current && current.start <= end ? current.start : end,
                    end,
                  }))
                }}
                className="ml-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-foreground dark:border-[#34343a] dark:bg-[#121214]"
              />
            </label>
          </>
        )}
        {selectedRange && (
          <button
            type="button"
            onClick={() => {
              captureExplorerAction('year_filter_cleared', {
                hasYearFilter: false,
              })
              setSelectedRange(null)
            }}
            className={`rounded-[4px] px-2 py-1 text-[11px] font-semibold ${MUTED} hover:text-foreground`}
          >
            Clear range
          </button>
        )}
      </div>
    </>
  )
}
