'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initialCamera,
  transform,
  type Bounds,
  type Camera,
} from '@/lib/hexMap/geometry'

export default function useMapCamera(
  bounds: Bounds,
  width: number,
  height: number,
) {
  const ref = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<Camera>(initialCamera)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(false)
  const frame = useRef(0)
  const pending = useRef(camera)
  const update = useCallback((next: Camera) => {
    pending.current = next
    cameraRef.current = next
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        setCamera(pending.current)
      })
  }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const zoomAt = useCallback(
    (factor: number, x = width / 2, y = height / 2) => {
      const old = cameraRef.current
      const t = transform(bounds, width, height, old)
      const zoom = Math.max(1, Math.min(8, old.zoom * factor))
      update({
        zoom,
        x: old.x + ((x - width / 2) / t.scale) * (1 - old.zoom / zoom),
        y: old.y + ((y - height / 2) / t.scale) * (1 - old.zoom / zoom),
      })
    },
    [bounds, width, height, update],
  )
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const wheel = (e: WheelEvent) => {
      // Let a fully zoomed-out map release scrolling to the rest of the page.
      // Shift also provides an explicit page-scroll escape at any zoom level.
      if (
        e.shiftKey ||
        (cameraRef.current.zoom <= 1 &&
          e.deltaY > 0 &&
          !e.ctrlKey &&
          !e.metaKey)
      )
        return
      e.preventDefault()
      const r = element.getBoundingClientRect()
      const delta =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1)
      zoomAt(
        Math.exp(
          -Math.max(-150, Math.min(150, delta)) * (e.ctrlKey ? 0.01 : 0.0025),
        ),
        e.clientX - r.left,
        e.clientY - r.top,
      )
    }
    // Labels overlay the canvas as siblings; scrolling over a community name
    // should zoom just like scrolling over the underlying map.
    const surface = element.parentElement ?? element
    surface.addEventListener('wheel', wheel, { passive: false })
    return () => surface.removeEventListener('wheel', wheel)
  }, [zoomAt, height])
  return {
    ref,
    camera,
    moved,
    zoomAt,
    reset: () => update(initialCamera),
    focus: (x: number, y: number) =>
      update({
        zoom: Math.max(2, cameraRef.current.zoom),
        x: x - bounds.x - bounds.width / 2,
        y: y - bounds.y - bounds.height / 2,
      }),
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return
        moved.current = false
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const p = pointers.current.get(e.pointerId)
        if (!p || (e.pointerType === 'touch' && pointers.current.size === 1))
          return
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y
        if (!moved.current && Math.hypot(dx, dy) < 4) return
        moved.current = true
        if (pointers.current.size === 2) {
          const other = Array.from(pointers.current.entries()).find(
            ([id]) => id !== e.pointerId,
          )![1]
          const before = Math.hypot(p.x - other.x, p.y - other.y)
          const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
          const r = e.currentTarget.getBoundingClientRect()
          if (before > 0)
            zoomAt(
              after / before,
              (e.clientX + other.x) / 2 - r.left,
              (e.clientY + other.y) / 2 - r.top,
            )
        } else {
          const old = cameraRef.current,
            t = transform(bounds, width, height, old)
          update({ ...old, x: old.x - dx / t.scale, y: old.y - dy / t.scale })
        }
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      },
      onPointerUp: (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
      },
      onPointerCancel: (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
        moved.current = true
      },
      onLostPointerCapture: (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
      },
    },
  }
}
