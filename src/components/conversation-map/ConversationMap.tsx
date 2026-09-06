'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import {
  boundedRange,
  DAY,
  yearDays,
  type ConversationMapData,
  type MapAnnotation,
} from '@/lib/conversation-map/types'
import { drawMap, hitMap, type MapGeometry } from './drawMap'
import styles from './conversationMap.module.css'

type Range = readonly [number, number]
type Hover = {
  annotation: MapAnnotation
  x: number
  y: number
  keyboard?: boolean
}
type Drag = {
  x: number
  range: Range
  mode: 'pan' | 'left' | 'right'
  moved: boolean
}
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export default function ConversationMap({
  initialYear,
}: {
  initialYear: number
}) {
  const [year, setYear] = useState(initialYear)
  const [years, setYears] = useState(
    Array.from({ length: initialYear - 2008 + 1 }, (_, i) => 2008 + i),
  )
  const [data, setData] = useState<ConversationMapData | null>(null)
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const [range, setRange] = useState<Range>([0, yearDays(initialYear)])
  const [width, setWidth] = useState(0),
    [hover, setHover] = useState<Hover | null>(null)
  const chart = useRef<SVGSVGElement>(null),
    overview = useRef<SVGSVGElement>(null),
    card = useRef<HTMLDivElement>(null)
  const geometry = useRef<MapGeometry>(),
    drag = useRef<Drag>(),
    overviewDrag = useRef<Drag>()
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(),
    hoverId = useRef<string | null>(null)
  const days = yearDays(year),
    span = range[1] - range[0],
    wholeYear = span >= days - 0.01
  const loading = data?.year !== year && !error
  const ready = data?.year === year && !error
  const hideHover = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = undefined
    hoverId.current = null
    setHover(null)
  }, [])
  const keepHover = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = undefined
  }, [])
  const dismissSoon = useCallback(() => {
    if (hoverTimer.current) return
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = undefined
      if (
        !card.current?.matches(':hover') &&
        !card.current?.contains(document.activeElement) &&
        !document.querySelector('[role="dialog"]')
      )
        hideHover()
    }, 120)
  }, [hideHover])
  const preview = useCallback(
    (
      annotation: MapAnnotation,
      clientX: number,
      clientY: number,
      keyboard = false,
    ) => {
      keepHover()
      if (hoverId.current === annotation.id) return
      hoverId.current = annotation.id
      const w = Math.min(420, document.documentElement.clientWidth - 24),
        h = Math.min(520, innerHeight - 24)
      const left =
        clientX + 16 + w <= document.documentElement.clientWidth - 12
          ? clientX + 16
          : clientX - w - 16
      setHover({
        annotation,
        x: Math.max(12, left),
        y: Math.max(12, Math.min(clientY - 30, innerHeight - h - 12)),
        keyboard,
      })
    },
    [keepHover],
  )

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setData(null)
    hideHover()
    fetch(`/api/conversation-map?year=${year}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Unable to load this year. Please retry.')
        return response.json() as Promise<ConversationMapData>
      })
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setYears(result.years)
        setRange([0, yearDays(result.year)])
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
    return () => controller.abort()
  }, [year, retry, hideHover])
  useEffect(() => {
    if (!chart.current) return
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    )
    observer.observe(chart.current)
    document.fonts.ready.then(() => {
      if (chart.current) setWidth(chart.current.getBoundingClientRect().width)
    })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    hideHover()
    if (!ready || !chart.current || !overview.current || width < 100) return
    geometry.current = drawMap(
      chart.current,
      overview.current,
      data!.annotations,
      year,
      range,
    )
  }, [data, year, range, width, ready, hideHover])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideHover()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('scroll', hideHover)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', hideHover)
      clearTimeout(hoverTimer.current)
    }
  }, [hideHover])
  useEffect(() => {
    if (hover?.keyboard) card.current?.querySelector('button')?.focus()
  }, [hover])

  const changeRange = useCallback(
    (lo: number, nextSpan: number) =>
      setRange(boundedRange(lo, nextSpan, days)),
    [days],
  )
  useEffect(() => {
    const svg = chart.current
    if (!svg) return
    const wheel = (event: WheelEvent) => {
      if (!ready || !event.deltaY || !geometry.current) return
      event.preventDefault()
      const g = geometry.current,
        r = svg.getBoundingClientRect(),
        px = ((event.clientX - r.left) * g.W) / r.width
      const fraction = Math.max(0, Math.min(1, (px - g.L) / (g.R - g.L)))
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? g.H : 1)
      setRange((previous) => {
        const oldSpan = previous[1] - previous[0],
          at = previous[0] + fraction * oldSpan
        const next = Math.max(
          7,
          Math.min(days, oldSpan * Math.exp(delta * 0.003)),
        )
        return boundedRange(at - fraction * next, next, days)
      })
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [days, ready])
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const r = event.currentTarget.getBoundingClientRect(),
      vb = event.currentTarget.viewBox.baseVal
    return {
      x: ((event.clientX - r.left) * vb.width) / r.width,
      y: ((event.clientY - r.top) * vb.height) / r.height,
    }
  }
  const pan = (direction: number) => {
    if (wholeYear) {
      const next = years[years.indexOf(year) + direction]
      if (next) setYear(next)
    } else changeRange(range[0] + span * 0.7 * direction, span)
  }
  const dateRange = `${dateFormat.format(new Date(Date.UTC(year, 0, 1) + range[0] * DAY))} — ${dateFormat.format(new Date(Date.UTC(year, 0, 1) + Math.min(days - 0.001, range[1]) * DAY))}`

  return (
    <section className={styles.map} aria-labelledby="conversation-map-title">
      <div className={styles.heading}>
        <div>
          <Link href="/community" className={styles.galleryLink}>
            ← Gallery
          </Link>
          <h1 id="conversation-map-title">Conversation map</h1>
          <p>Community quotes over time · Zoom to reveal more conversations</p>
        </div>
        <label className={styles.yearPicker}>
          Explore a year
          <select
            aria-label="Explore a year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[...years].reverse().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.segmented} aria-label="Time window">
          {[
            ['Year', days],
            ['Quarter', 90],
            ['Month', 30],
            ['Week', 7],
          ].map(([label, size]) => (
            <button
              key={label}
              disabled={!ready}
              aria-pressed={Math.abs(span - Number(size)) < 0.01}
              onClick={() => {
                const center = wholeYear
                  ? (data?.annotations[0]?.day ?? days / 2)
                  : (range[0] + range[1]) / 2
                changeRange(
                  Number(size) === days ? 0 : center - Number(size) / 2,
                  Number(size),
                )
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.pan}>
          <button
            aria-label={wholeYear ? 'Previous year' : 'Earlier dates'}
            disabled={
              !ready ||
              (wholeYear ? years.indexOf(year) === 0 : range[0] <= 0.001)
            }
            onClick={() => pan(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <div className={styles.interval}>
            <strong>{year}</strong>
            <span aria-live="polite">{dateRange}</span>
          </div>
          <button
            aria-label={wholeYear ? 'Next year' : 'Later dates'}
            disabled={
              !ready ||
              (wholeYear
                ? years.indexOf(year) === years.length - 1
                : range[1] >= days - 0.001)
            }
            onClick={() => pan(1)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <label className={styles.zoom}>
          Zoom
          <input
            type="range"
            aria-label="Timeline zoom"
            min="0"
            max="100"
            disabled={!ready}
            value={(100 * Math.log(days / span)) / Math.log(days / 7)}
            onChange={(e) => {
              const next =
                days * Math.pow(7 / days, Number(e.target.value) / 100)
              changeRange((range[0] + range[1] - next) / 2, next)
            }}
          />
        </label>
      </div>
      <div className={styles.plot} aria-busy={loading}>
        {(loading || error || (ready && !data?.annotations.length)) && (
          <div className={styles.message} role={error ? 'alert' : 'status'}>
            {loading
              ? 'Loading conversations…'
              : error || 'No ranked conversations found for this year.'}
            {error && (
              <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
            )}
          </div>
        )}
        <svg
          ref={chart}
          className={styles.chart}
          style={{ visibility: ready ? 'visible' : 'hidden' }}
          role="group"
          aria-label={`${year} conversation map. Height shows community quote counts, not tweet volume.`}
          onPointerDown={(e) => {
            if (e.button !== 0 || !ready || !geometry.current) return
            const p = point(e)
            if (p.x < geometry.current.L || p.x > geometry.current.R) return
            drag.current = { x: p.x, range, mode: 'pan', moved: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!ready || !geometry.current) return
            const p = point(e),
              g = geometry.current,
              d = drag.current
            if (d) {
              if (Math.abs(p.x - d.x) > 5) d.moved = true
              if (d.moved) {
                const delta =
                  ((p.x - d.x) / (g.R - g.L)) * (d.range[1] - d.range[0])
                changeRange(d.range[0] - delta, d.range[1] - d.range[0])
              }
              return
            }
            const annotation = hitMap(g, p.x, p.y)
            e.currentTarget.style.cursor = annotation ? 'pointer' : 'grab'
            if (annotation) preview(annotation, e.clientX, e.clientY)
            else dismissSoon()
          }}
          onPointerUp={(e) => {
            const d = drag.current
            drag.current = undefined
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            if (d && !d.moved && geometry.current) {
              const p = point(e),
                annotation = hitMap(geometry.current, p.x, p.y)
              if (annotation) preview(annotation, e.clientX, e.clientY)
            }
          }}
          onPointerCancel={() => {
            drag.current = undefined
          }}
          onPointerLeave={dismissSoon}
          onDoubleClick={(e) => {
            if (!ready || !geometry.current) return
            const r = e.currentTarget.getBoundingClientRect(),
              g = geometry.current
            const fraction = Math.max(
              0,
              Math.min(
                1,
                (((e.clientX - r.left) * g.W) / r.width - g.L) / (g.R - g.L),
              ),
            )
            changeRange(range[0] + span * fraction - span / 4, span / 2)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            const target = (e.target as Element).closest('[data-candidate]')
            const annotation = data?.annotations.find(
              (a) => a.id === target?.getAttribute('data-candidate'),
            )
            if (annotation && target) {
              e.preventDefault()
              const r = target.getBoundingClientRect()
              preview(annotation, r.x, r.y, true)
            }
          }}
        />
        <svg
          ref={overview}
          className={styles.overview}
          style={{ visibility: ready ? 'visible' : 'hidden' }}
          role="img"
          aria-label="Full year overview. Drag the window or its edges to pan and zoom."
          onPointerDown={(e) => {
            if (e.button !== 0 || !ready || !geometry.current) return
            const p = point(e),
              g = geometry.current,
              at = Math.max(
                0,
                Math.min(days, ((p.x - g.L) / (g.R - g.L)) * days),
              )
            const left = g.L + (range[0] / days) * (g.R - g.L),
              right = g.L + (range[1] / days) * (g.R - g.L)
            const dl = Math.abs(p.x - left),
              dr = Math.abs(p.x - right)
            const mode =
              Math.min(dl, dr) < 12 ? (dl < dr ? 'left' : 'right') : 'pan'
            let initial = range
            if (mode === 'pan' && (at < range[0] || at > range[1])) {
              initial = boundedRange(at - span / 2, span, days)
              setRange(initial)
            }
            overviewDrag.current = { x: at, range: initial, mode, moved: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = overviewDrag.current,
              g = geometry.current
            if (!d || !g) return
            const p = point(e),
              at = Math.max(
                0,
                Math.min(days, ((p.x - g.L) / (g.R - g.L)) * days),
              ),
              delta = at - d.x
            if (d.mode === 'left') {
              const lo = Math.max(
                0,
                Math.min(d.range[1] - 7, d.range[0] + delta),
              )
              changeRange(lo, d.range[1] - lo)
            } else if (d.mode === 'right')
              changeRange(
                d.range[0],
                Math.min(days, d.range[1] + delta) - d.range[0],
              )
            else changeRange(d.range[0] + delta, d.range[1] - d.range[0])
          }}
          onPointerUp={(e) => {
            overviewDrag.current = undefined
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => {
            overviewDrag.current = undefined
          }}
        />
      </div>
      <div className={styles.help}>
        <span>Scroll to zoom · Drag to pan · Hover or select to read</span>
        <span>
          Up to 200 top posts per year · UTC · Height is quotes, not tweet
          volume
        </span>
      </div>
      {hover && (
        <div
          ref={card}
          className={styles.hoverCard}
          style={{ left: hover.x, top: hover.y }}
          role="region"
          aria-label="Tweet preview"
          onPointerEnter={keepHover}
          onPointerLeave={dismissSoon}
          onBlur={dismissSoon}
        >
          <div className={styles.cardHeader}>
            <span>
              {hover.annotation.tweets.length > 1
                ? 'Related conversations'
                : 'Original post'}
            </span>
            <button aria-label="Close tweet preview" onClick={hideHover}>
              <X size={16} />
            </button>
          </div>
          <div className={styles.cardBody}>
            {hover.annotation.tweets.map((tweet) => (
              <TweetCard
                key={tweet.id}
                tweet={tweet}
                noClamp
                showDate
                clickable={false}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
