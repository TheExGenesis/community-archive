'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import {
  drawMap,
  hitMap,
  type MapGeometry,
} from '@/components/conversation-map/drawMap'
import styles from '@/components/conversation-map/conversationMap.module.css'
import { drawWeekColumn } from '@/components/digest/drawWeekColumn'
import type { MapAnnotation } from '@/lib/conversation-map/types'
import { WEEKLY_MAP_COLORS, type WeeklyMapData } from '@/lib/digest/weeklyMap'

type Hover = { annotation: MapAnnotation; x: number; y: number }

const STORY_COLORS = Object.fromEntries(
  WEEKLY_MAP_COLORS.map((color, index) => [`--map-story${index + 1}`, color]),
) as CSSProperties

/**
 * The conversation map fixed to one week: a dot per story tweet, height is
 * community quotes. Hover or select a dot or label to read the tweet.
 */
export function WeeklyConversationMap({
  data,
  label,
  legend,
  vertical = false,
}: {
  data: WeeklyMapData
  label: string
  legend?: { title: string; color: string }[]
  /** Time runs down the page; for a narrow column beside the stories. */
  vertical?: boolean
}) {
  const chart = useRef<SVGSVGElement>(null)
  const overview = useRef<SVGSVGElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const geometry = useRef<MapGeometry | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setHover(null)
  }, [])
  const dismissSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!card.current?.matches(':hover')) setHover(null)
    }, 150)
  }, [])
  const show = useCallback(
    (annotation: MapAnnotation, clientX: number, clientY: number) => {
      clearTimeout(timer.current)
      setHover((current) => {
        if (current?.annotation.id === annotation.id) return current
        const w = Math.min(420, document.documentElement.clientWidth - 24)
        const h = Math.min(520, innerHeight - 24)
        const left =
          clientX + 16 + w <= document.documentElement.clientWidth - 12
            ? clientX + 16
            : clientX - w - 16
        return {
          annotation,
          x: Math.max(12, left),
          y: Math.max(12, Math.min(clientY - 30, innerHeight - h - 12)),
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!chart.current) return
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    )
    observer.observe(chart.current)
    void document.fonts?.ready.then(() => {
      if (chart.current) setWidth(chart.current.getBoundingClientRect().width)
    })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!chart.current || !overview.current || width < 100) return
    geometry.current = vertical
      ? drawWeekColumn(
          chart.current,
          data.annotations,
          data.year,
          data.range,
          data.leaders,
        )
      : drawMap(
          chart.current,
          overview.current,
          data.annotations,
          data.year,
          data.range,
        )
  }, [data, width, vertical])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('scroll', hide, { passive: true })
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', hide)
      clearTimeout(timer.current)
    }
  }, [hide])

  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const r = event.currentTarget.getBoundingClientRect()
    const vb = event.currentTarget.viewBox.baseVal
    return {
      x: ((event.clientX - r.left) * vb.width) / r.width,
      y: ((event.clientY - r.top) * vb.height) / r.height,
    }
  }

  if (data.annotations.length === 0) return null
  return (
    <figure className={`${styles.map} not-prose`} style={STORY_COLORS}>
      <div
        className={`${styles.plot} rounded-xl border-t ${vertical ? '!px-2.5 !pt-3' : ''}`}
      >
        <svg
          ref={chart}
          className={styles.chart}
          style={{ cursor: 'default' }}
          role="group"
          aria-label={`${label}. ${vertical ? 'Distance to the right' : 'Height'} shows community quote counts.`}
          onPointerMove={(event) => {
            if (!geometry.current) return
            const p = point(event)
            const annotation = hitMap(geometry.current, p.x, p.y)
            event.currentTarget.style.cursor = annotation
              ? 'pointer'
              : 'default'
            if (annotation) show(annotation, event.clientX, event.clientY)
            else dismissSoon()
          }}
          onPointerUp={(event) => {
            if (!geometry.current) return
            const p = point(event)
            const annotation = hitMap(geometry.current, p.x, p.y)
            if (annotation) show(annotation, event.clientX, event.clientY)
          }}
          onPointerLeave={dismissSoon}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            const target = (event.target as Element).closest('[data-candidate]')
            const annotation = data.annotations.find(
              (a) => a.id === target?.getAttribute('data-candidate'),
            )
            if (annotation && target) {
              event.preventDefault()
              const r = target.getBoundingClientRect()
              show(annotation, r.x, r.y)
            }
          }}
        />
        {/* drawMap also renders a whole-year overview; a week map hides it. */}
        <svg ref={overview} style={{ display: 'none' }} aria-hidden="true" />
      </div>
      <figcaption
        className={`${styles.help} flex-col !gap-2 ${vertical ? '' : 'sm:flex-row'}`}
      >
        {legend && legend.length > 0 ? (
          <span
            className={
              vertical
                ? 'flex flex-col gap-1.5'
                : 'flex flex-wrap gap-x-4 gap-y-1'
            }
          >
            {legend.map((item) => (
              <span
                key={item.title}
                className="inline-flex items-start gap-1.5"
              >
                <span
                  aria-hidden
                  className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                {item.title}
              </span>
            ))}
          </span>
        ) : (
          <span>
            {vertical
              ? 'Numbers mark each story’s most-quoted tweet. Hover a dot to read it.'
              : 'Hover or select a dot to read the tweet'}
          </span>
        )}
        <span>
          {vertical
            ? 'UTC · Further right is more community quotes'
            : 'UTC · Height is community quotes'}
        </span>
      </figcaption>
      {hover ? (
        <div
          ref={card}
          className={styles.hoverCard}
          style={{ left: hover.x, top: hover.y }}
          role="region"
          aria-label="Tweet preview"
          onPointerEnter={() => clearTimeout(timer.current)}
          onPointerLeave={dismissSoon}
        >
          <div className={styles.cardHeader}>
            <span>Tweet</span>
            <button aria-label="Close tweet preview" onClick={hide}>
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
      ) : null}
    </figure>
  )
}
