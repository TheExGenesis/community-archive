'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'

type Bounds = { x: number; y: number; width: number; height: number }
const initialCamera = { zoom: 1, x: 0, y: 0 }
const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value))

export default function useMapViewport(bounds: Bounds | null) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState(initialCamera)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{
    id: number
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!bounds || !rect || !rect.width || !rect.height) return
      const units = Math.max(
        bounds.width / rect.width,
        bounds.height / rect.height,
      )
      const dx =
        clientX === undefined ? 0 : clientX - rect.left - rect.width / 2
      const dy =
        clientY === undefined ? 0 : clientY - rect.top - rect.height / 2
      setCamera((old) => {
        const zoom = Math.max(1, Math.min(6, old.zoom * factor))
        return {
          zoom,
          x: clamp(
            old.x + dx * units * (1 / old.zoom - 1 / zoom),
            bounds.width / 2,
          ),
          y: clamp(
            old.y + dy * units * (1 / old.zoom - 1 / zoom),
            bounds.height / 2,
          ),
        }
      })
    },
    [bounds],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !bounds) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1)
      zoomAt(
        Math.exp(-clamp(pixels, 250) * 0.002),
        event.clientX,
        event.clientY,
      )
    }
    // React's delegated wheel listener is passive; prevent page scrolling only
    // while the pointer is over the loaded map.
    viewport.addEventListener('wheel', wheel, { passive: false })
    return () => viewport.removeEventListener('wheel', wheel)
  }, [bounds, zoomAt])

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    suppressClick.current = drag.current.moved
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return {
    viewportRef,
    dragging,
    zoom: camera.zoom,
    zoomAt,
    reset: () => setCamera(initialCamera),
    viewBox: bounds
      ? `${bounds.x + (bounds.width - bounds.width / camera.zoom) / 2 + camera.x} ${bounds.y + (bounds.height - bounds.height / camera.zoom) / 2 + camera.y} ${bounds.width / camera.zoom} ${bounds.height / camera.zoom}`
      : undefined,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!bounds || event.button !== 0 || drag.current) return
        suppressClick.current = false
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        }
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current
        const rect = viewportRef.current?.getBoundingClientRect()
        if (
          !bounds ||
          !rect?.width ||
          !rect.height ||
          current?.id !== event.pointerId
        )
          return
        const dx = event.clientX - current.x,
          dy = event.clientY - current.y
        if (!current.moved && Math.hypot(dx, dy) < 4) return
        if (!current.moved) {
          current.moved = true
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }
        const units = Math.max(
          bounds.width / rect.width,
          bounds.height / rect.height,
        )
        current.x = event.clientX
        current.y = event.clientY
        setCamera((old) => ({
          ...old,
          x: clamp(old.x - (dx * units) / old.zoom, bounds.width / 2),
          y: clamp(old.y - (dy * units) / old.zoom, bounds.height / 2),
        }))
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (suppressClick.current) {
          event.preventDefault()
          event.stopPropagation()
          suppressClick.current = false
        }
      },
    },
  }
}
