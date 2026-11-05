'use client'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import styles from './hero.module.css'

/** Keep drag updates local so the map and feed don't rerender with each move. */
export default function ResizableHero({
  children,
}: {
  children: [ReactNode, ReactNode]
}) {
  const row = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; width: number } | undefined>(undefined)
  const [rowWidth, setRowWidth] = useState(0)
  const [width, setWidth] = useState<number>()
  const minimum = 300
  const maximum = Math.max(minimum, Math.min(640, rowWidth - 376))
  const defaultWidth = Math.max(minimum, Math.min(400, rowWidth * 0.27))
  const current = Math.round(
    Math.max(minimum, Math.min(maximum, width ?? defaultWidth)),
  )
  useEffect(() => {
    if (!row.current) return
    const observer = new ResizeObserver(([entry]) =>
      setRowWidth(entry.contentRect.width),
    )
    observer.observe(row.current)
    return () => observer.disconnect()
  }, [])
  const resize = (value: number) =>
    setWidth(Math.max(minimum, Math.min(maximum, value)))
  return (
    <div
      ref={row}
      className={styles.row}
      style={
        rowWidth
          ? ({ '--sidebar-width': `${current}px` } as CSSProperties)
          : undefined
      }
    >
      {children[0]}
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize sidebar"
        aria-controls="hex-story-panel"
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={current}
        aria-valuetext={`${current} pixels wide`}
        title="Drag to resize sidebar. Arrow keys adjust; double-click resets."
        className={styles.resizeHandle}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, width: current }
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + drag.current.x - event.clientX)
        }}
        onPointerUp={(event) => {
          drag.current = undefined
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          drag.current = undefined
        }}
        onLostPointerCapture={() => {
          drag.current = undefined
        }}
        onDoubleClick={() => setWidth(undefined)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return
          event.preventDefault()
          resize(
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : current + (event.key === 'ArrowLeft' ? 20 : -20),
          )
        }}
      >
        <span aria-hidden="true" />
      </div>
      {children[1]}
    </div>
  )
}
