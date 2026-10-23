'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initialCamera,
  transform,
  type Bounds,
  type Camera,
} from '@/lib/hexMap/geometry'

type Point = { x: number; y: number }
const touchPoints = (touches: TouchList) =>
  Array.from(touches, (touch) => ({ x: touch.clientX, y: touch.clientY }))
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export default function useMapCamera(
  bounds: Bounds,
  width: number,
  height: number,
) {
  // Includes labels, but excludes map controls and other page content.
  const ref = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<Camera>(initialCamera)
  const cameraRef = useRef(camera)
  const pointer = useRef<(Point & { id: number }) | null>(null)
  const moved = useRef(false)
  const touchInput = useRef(false)
  const frame = useRef(0)
  const animation = useRef(0)
  const update = useCallback((next: Camera) => {
    cancelAnimationFrame(animation.current)
    cameraRef.current = next
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        setCamera(cameraRef.current)
      })
  }, [])
  // Reset and reduced-motion focus commit immediately.
  const commit = (next: Camera) => {
    cancelAnimationFrame(animation.current)
    cancelAnimationFrame(frame.current)
    frame.current = 0
    cameraRef.current = next
    setCamera(next)
  }
  const focusCamera = (next: Camera) => {
    const from = cameraRef.current
    commit(from)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      commit(next)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 200)
      const ease = 1 - Math.pow(1 - progress, 3)
      const current = {
        x: from.x + (next.x - from.x) * ease,
        y: from.y + (next.y - from.y) * ease,
        zoom: from.zoom + (next.zoom - from.zoom) * ease,
      }
      cameraRef.current = current
      setCamera(current)
      animation.current = progress < 1 ? requestAnimationFrame(step) : 0
    }
    animation.current = requestAnimationFrame(step)
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(animation.current)
    },
    [],
  )
  const zoomAt = useCallback(
    (factor: number, x = width / 2, y = height / 2) => {
      const old = cameraRef.current
      const t = transform(bounds, width, height, old)
      const zoom = Math.max(0.5, Math.min(8, old.zoom * factor))
      update({
        zoom,
        x: old.x + ((x - width / 2) / t.scale) * (1 - old.zoom / zoom),
        y: old.y + ((y - height / 2) / t.scale) * (1 - old.zoom / zoom),
      })
    },
    [bounds, width, height, update],
  )
  useEffect(() => {
    const surface = ref.current
    if (!surface) return
    const wheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      const r = surface.getBoundingClientRect()
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
    let previous: Point[] = []
    let start: Point | undefined
    let multiTouch = false
    let pageScroll = false
    const touchStart = (e: TouchEvent) => {
      cancelAnimationFrame(animation.current)
      touchInput.current = true
      if (!previous.length) {
        moved.current = false
        multiTouch = false
        pageScroll = false
        start = touchPoints(e.touches)[0]
      }
      previous = touchPoints(e.touches)
      if (previous.length > 1) {
        moved.current = true
        multiTouch = true
        // Claim the gesture before the browser starts scrolling. Never try
        // to take over a one-finger scroll that is already in progress.
        if (!pageScroll && e.cancelable) e.preventDefault()
      }
    }
    const touchMove = (e: TouchEvent) => {
      const next = touchPoints(e.touches)
      if (!multiTouch) {
        if (
          start &&
          next[0] &&
          Math.hypot(next[0].x - start.x, next[0].y - start.y) > 6
        ) {
          moved.current = true
          pageScroll = true
        }
        previous = next
        return // Native one-finger page scrolling, including over labels.
      }
      if (pageScroll || !e.cancelable) {
        previous = next
        return
      }
      e.preventDefault()
      if (previous.length === 2 && next.length === 2) {
        const before = midpoint(previous[0], previous[1])
        const after = midpoint(next[0], next[1])
        const distance = Math.hypot(
          previous[0].x - previous[1].x,
          previous[0].y - previous[1].y,
        )
        const nextDistance = Math.hypot(
          next[0].x - next[1].x,
          next[0].y - next[1].y,
        )
        const old = cameraRef.current
        const t = transform(bounds, width, height, old)
        const zoom = Math.max(
          0.5,
          Math.min(8, old.zoom * (distance > 0 ? nextDistance / distance : 1)),
        )
        const scale = (t.scale * zoom) / old.zoom
        const r = surface.getBoundingClientRect()
        update({
          zoom,
          x:
            old.x +
            (before.x - r.left - width / 2) / t.scale -
            (after.x - r.left - width / 2) / scale,
          y:
            old.y +
            (before.y - r.top - height / 2) / t.scale -
            (after.y - r.top - height / 2) / scale,
        })
      }
      previous = next
    }
    const touchEnd = (e: TouchEvent) => {
      // Keep suppression until all fingers lift and a fresh gesture starts.
      if (multiTouch && !pageScroll && e.cancelable) e.preventDefault()
      if (e.type === 'touchcancel') moved.current = true
      previous = touchPoints(e.touches)
    }
    // React delegates passive touch listeners. Native non-passive listeners
    // let two fingers control the map while one finger retains native scroll.
    surface.addEventListener('wheel', wheel, { passive: false })
    surface.addEventListener('touchstart', touchStart, { passive: false })
    surface.addEventListener('touchmove', touchMove, { passive: false })
    surface.addEventListener('touchend', touchEnd, { passive: false })
    surface.addEventListener('touchcancel', touchEnd)
    return () => {
      surface.removeEventListener('wheel', wheel)
      surface.removeEventListener('touchstart', touchStart)
      surface.removeEventListener('touchmove', touchMove)
      surface.removeEventListener('touchend', touchEnd)
      surface.removeEventListener('touchcancel', touchEnd)
    }
  }, [bounds, width, height, zoomAt, update])
  return {
    ref,
    camera,
    moved,
    touchInput,
    zoomAt,
    reset: () => commit(initialCamera),
    focus: (x: number, y: number, minimumZoom = 2) =>
      focusCamera({
        zoom: Math.min(8, Math.max(minimumZoom, cameraRef.current.zoom)),
        x: x - bounds.x - bounds.width / 2,
        y: y - bounds.y - bounds.height / 2,
      }),
    fit: (points: Point[]) => {
      if (!points.length) return
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y)
      const left = Math.min(...xs),
        right = Math.max(...xs)
      const top = Math.min(...ys),
        bottom = Math.max(...ys)
      const overview = transform(bounds, width, height, initialCamera)
      const scale = Math.min(
        (width - 120) / Math.max(right - left, bounds.width / 8),
        (height - 120) / Math.max(bottom - top, bounds.height / 8),
      )
      focusCamera({
        x: (left + right) / 2 - bounds.x - bounds.width / 2,
        y: (top + bottom) / 2 - bounds.y - bounds.height / 2,
        zoom: Math.max(0.5, Math.min(8, scale / overview.scale)),
      })
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' || e.button !== 0) return
        cancelAnimationFrame(animation.current)
        touchInput.current = false
        moved.current = false
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        // Don't retarget label clicks to the surface.
        const target =
          (e.target as Element).closest('button') ?? e.currentTarget
        target.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const p = pointer.current
        if (e.pointerType === 'touch' || !p || p.id !== e.pointerId) return
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y
        if (!moved.current && Math.hypot(dx, dy) < 4) return
        moved.current = true
        const old = cameraRef.current
        const t = transform(bounds, width, height, old)
        update({ ...old, x: old.x - dx / t.scale, y: old.y - dy / t.scale })
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      },
      onPointerUp: () => {
        pointer.current = null
      },
      onPointerCancel: (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') return
        pointer.current = null
        moved.current = true
      },
      onLostPointerCapture: () => {
        pointer.current = null
      },
    },
  }
}
