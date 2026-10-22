'use client'
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTheme } from 'next-themes'
import {
  geometry,
  hitCell,
  mix,
  placeLabels,
  safeTerm,
  selectionOutline,
  transform,
  type MapLabel,
} from '@/lib/hexMap/geometry'
import type { HexSnapshot } from '@/lib/hexMap/types'
import useMapCamera from './useMapCamera'
import styles from './hero.module.css'

function polygon(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
) {
  ctx.beginPath()
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
}

export default memo(function HexMap({
  snapshot,
  selected,
  onSelect,
  onSelectionIntent,
  storyCells,
  origin,
  tweetHover,
  pins,
  anchor,
  heat,
  heatTerm,
  heatStatus,
  onRetryHeat,
  onClearHeat,
  scrubber,
  coverageLive,
  finder,
  selfLocation,
}: {
  snapshot: HexSnapshot
  selected: number[]
  onSelect: (cells: number[]) => void
  onSelectionIntent: (cells: number[] | null) => void
  storyCells: number[]
  origin?: number
  tweetHover?: { cell: number; username: string }
  pins: { username: string; cell: number }[]
  anchor: string
  heat?: Map<number, number>
  heatTerm: string
  heatStatus?: string
  onRetryHeat: () => void
  onClearHeat: () => void
  scrubber: ReactNode
  coverageLive: boolean
  finder?: ReactNode
  selfLocation?: { username: string; cell: number } | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 800, height: 650 })
  const [layer, setLayer] = useState<'week' | 'archived'>('week')
  const [hovered, setHovered] = useState<number | null>(null)
  const [keyboardCell, setKeyboardCell] = useState(0)
  const [fontsReady, setFontsReady] = useState(0)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const geo = useMemo(() => geometry(snapshot), [snapshot])
  const camera = useMapCamera(geo.bounds, size.width, size.height)
  const lastSelfLocation = useRef(selfLocation)
  useEffect(() => {
    if (selfLocation && lastSelfLocation.current !== selfLocation) {
      const cell = snapshot.cells[selfLocation.cell]
      if (cell) camera.focus(cell.x, -cell.y)
    }
    lastSelfLocation.current = selfLocation
  }, [selfLocation, snapshot, camera])
  const lastAnchor = useRef('')
  useEffect(() => {
    const pin = pins.find(
      (p) => p.username.toLowerCase() === anchor.toLowerCase(),
    )
    if (pin && anchor && lastAnchor.current !== anchor) {
      lastAnchor.current = anchor
      const cell = snapshot.cells[pin.cell]
      camera.focus(cell.x, -cell.y)
    }
    if (!anchor) lastAnchor.current = ''
  }, [anchor, pins, snapshot, camera])
  const t = transform(geo.bounds, size.width, size.height, camera.camera)
  const focus = useMemo(
    () =>
      new Set(
        (storyCells.length ? storyCells : selected).map(
          (i) => snapshot.cells[i]?.region,
        ),
      ),
    [snapshot, storyCells, selected],
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedRegions = useMemo(
    () => new Set(selected.map((id) => snapshot.cells[id]?.region)),
    [selected, snapshot],
  )
  const outline = useMemo(
    () => selectionOutline(geo.edges, selectedSet),
    [geo, selectedSet],
  )
  const totals = useMemo(
    () =>
      snapshot.regions.map((r) =>
        snapshot.cells
          .filter((c) => c.region === r.id)
          .reduce((sum, c) => sum + c.accounts, 0),
      ),
    [snapshot],
  )
  const [base, setBase] = useState<HTMLCanvasElement | null>(null)
  const bufferRef = useRef<HTMLCanvasElement | null>(null)
  const [baseRevision, setBaseRevision] = useState(0)

  useEffect(() => {
    const element = camera.ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    )
    observer.observe(element)
    let active = true
    document.fonts.ready.then(() => {
      if (active) setFontsReady((n) => n + 1)
    })
    return () => {
      active = false
      observer.disconnect()
    }
  }, [camera.ref])

  // Rasterize the static layer only when its actual inputs change, never on
  // pointer movement, label layout, pan, zoom, or tweet hover.
  useEffect(() => {
    const buffer = bufferRef.current ?? document.createElement('canvas')
    bufferRef.current = buffer
    const scale = 2600 / Math.max(geo.bounds.width, geo.bounds.height)
    const bufferWidth = Math.ceil(geo.bounds.width * scale),
      bufferHeight = Math.ceil(geo.bounds.height * scale)
    if (buffer.width !== bufferWidth || buffer.height !== bufferHeight) {
      buffer.width = bufferWidth
      buffer.height = bufferHeight
    }
    const ctx = buffer.getContext('2d')!
    ctx.resetTransform()
    ctx.clearRect(0, 0, buffer.width, buffer.height)
    ctx.scale(scale, scale)
    ctx.translate(-geo.bounds.x, -geo.bounds.y)
    const shares = snapshot.cells
      .map((c, id) =>
        heat ? (heat.get(id) ?? 0) : c.archived / Math.max(1, c.accounts),
      )
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    const p98 = shares[Math.floor(shares.length * 0.98)] || 1
    snapshot.cells.forEach((c, id) => {
      const paletteColor =
        snapshot.regions.find((r) => r.id === c.region)?.color ?? '#888888'
      // A shared warm gray brings the hues closer without merging split regions.
      const color = mix(paletteColor, '#b6b3ae', 0.25)
      const focused = !focus.size || focus.has(c.region)
      let fill = mix(color, dark ? '#252530' : '#ffffff', dark ? 0.15 : 0.27)
      if (layer === 'week' && !heat)
        fill = mix(
          fill,
          dark ? '#18181b' : '#ffffff',
          Math.max(0, 0.4 - Math.log1p(c.activity) * 0.18),
        )
      else if (heat ? heat.get(id) : c.archived) {
        const strength = Math.min(
          1,
          Math.log1p(
            ((heat
              ? (heat.get(id) ?? 0)
              : c.archived / Math.max(1, c.accounts)) /
              p98) *
              20,
          ) / Math.log(21),
        )
        fill =
          focus.size && focused && !heat
            ? mix(color, '#593315', strength * 0.45)
            : mix('#f3d8ad', '#b54a0c', strength)
      } else fill = mix(fill, dark ? '#18181b' : '#f4f4f5', 0.65)
      ctx.globalAlpha = focused ? 1 : 0.22
      ctx.fillStyle = fill
      polygon(ctx, geo.vertices[id])
      ctx.fill()
    })
    ctx.globalAlpha = 1
    const borders = geo.edges.filter(
      (e) =>
        e.cells.length === 2 &&
        snapshot.cells[e.cells[0]].region !== snapshot.cells[e.cells[1]].region,
    )
    for (const [color, width] of [
      [dark ? '#27272a' : '#ffffff', 2.4],
      ['#71717a', 0.8],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width / scale
      ctx.beginPath()
      borders.forEach((e) => {
        ctx.moveTo(e.a.x, e.a.y)
        ctx.lineTo(e.b.x, e.b.y)
      })
      ctx.stroke()
    }
    setBase(buffer)
    setBaseRevision((n) => n + 1)
  }, [geo, snapshot, layer, focus, dark, heat])

  useEffect(() => {
    void baseRevision
    const element = canvas.current
    if (!element || !base || !size.width || !size.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    element.width = Math.round(size.width * dpr)
    element.height = Math.round(size.height * dpr)
    const ctx = element.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.translate(t.x, t.y)
    ctx.scale(t.scale, t.scale)
    ctx.drawImage(
      base,
      geo.bounds.x,
      geo.bounds.y,
      geo.bounds.width,
      geo.bounds.height,
    )
    const active = hovered
    if (active != null && geo.vertices[active]) {
      ctx.fillStyle = '#ffffff99'
      polygon(ctx, geo.vertices[active])
      ctx.fill()
    }
    storyCells.forEach((id) => {
      const c = snapshot.cells[id]
      if (!c) return
      ctx.fillStyle = id === origin ? '#1e9bcd44' : '#1e9bcd26'
      ctx.beginPath()
      ctx.arc(c.x, -c.y, (id === origin ? 13 : 10) / t.scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3f3f46'
      ctx.beginPath()
      ctx.arc(c.x, -c.y, 3.5 / t.scale, 0, Math.PI * 2)
      ctx.fill()
    })
    if (selected.length === 1) {
      ctx.fillStyle = dark ? '#38bdf888' : '#0284c766'
      polygon(ctx, geo.vertices[selected[0]])
      ctx.fill()
    }
    ctx.strokeStyle = dark ? '#7dd3fc' : '#10516b'
    ctx.lineWidth = (selected.length === 1 ? 3.5 : 2.4) / t.scale
    ctx.beginPath()
    outline.forEach((e) => {
      ctx.moveTo(e.a.x, e.a.y)
      ctx.lineTo(e.b.x, e.b.y)
    })
    ctx.stroke()
    pins.forEach((p) => {
      const c = snapshot.cells[p.cell]
      if (!c) return
      ctx.beginPath()
      ctx.arc(c.x, -c.y, 3.5 / t.scale, 0, Math.PI * 2)
      ctx.fillStyle = '#3f3f46'
      ctx.fill()
    })
    // Keep author focus compact and constant in screen space at every zoom.
    const authorCell = tweetHover && snapshot.cells[tweetHover.cell]
    if (authorCell) {
      ctx.fillStyle = '#1e9bcd33'
      ctx.beginPath()
      ctx.arc(authorCell.x, -authorCell.y, 12 / t.scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3f3f46'
      ctx.beginPath()
      ctx.arc(authorCell.x, -authorCell.y, 4 / t.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [
    base,
    baseRevision,
    size,
    t.scale,
    t.x,
    t.y,
    geo,
    snapshot,
    storyCells,
    origin,
    outline,
    selected,
    hovered,
    tweetHover,
    pins,
    dark,
  ])

  const labels = useMemo(() => {
    if (typeof document === 'undefined') return []
    // A font-load revision invalidates measurements even when the CSS family is unchanged.
    void fontsReady
    const ctx = document.createElement('canvas').getContext('2d')!
    const fontFamily = camera.ref.current
      ? getComputedStyle(camera.ref.current).fontFamily
      : 'sans-serif'
    const candidates: MapLabel[] = [...snapshot.regions]
      .sort((a, b) => totals[b.id] - totals[a.id])
      .map((r) => ({
        text: camera.camera.zoom >= 2.2 ? r.name : r.short,
        x: r.x * t.scale + t.x,
        y: -r.y * t.scale + t.y,
        size: 12,
        kind: 'country',
        region: r.id,
      }))
    const pinLabels: MapLabel[] = pins.flatMap((p) => {
      // The hovered author is named once, in the tooltip pointing to their dot.
      if (p.username.toLowerCase() === tweetHover?.username.toLowerCase())
        return []
      const c = snapshot.cells[p.cell]
      return c
        ? [
            {
              text: '@' + p.username,
              x: c.x * t.scale + t.x,
              y: -c.y * t.scale + t.y - 12,
              size: 11,
              kind:
                p.username.toLowerCase() === anchor.toLowerCase()
                  ? 'anchor'
                  : 'pin',
              region: c.region,
              id: p.cell,
            },
          ]
        : []
    })
    candidates.unshift(...pinLabels.filter((p) => p.kind === 'anchor'))
    candidates.push(...pinLabels.filter((p) => p.kind !== 'anchor'))
    // Keep the overview readable; reveal signature phrases after zooming in.
    if (camera.camera.zoom >= 1.5) {
      for (const c of [...(snapshot.clusters ?? [])].sort(
        (a, b) => b.size - a.size,
      )) {
        if (selectedRegions.size && !selectedRegions.has(c.region)) continue
        if (safeTerm(c.label))
          candidates.push({
            text: c.label,
            x: c.x * t.scale + t.x,
            y: -c.y * t.scale + t.y,
            size: 11,
            kind: 'cluster',
            region: c.region,
          })
      }
    }
    if (camera.camera.zoom >= 2.7 && snapshot.radius * 2 * t.scale >= 32)
      snapshot.cells.forEach((c, id) => {
        if (selectedRegions.size && !selectedRegions.has(c.region)) return
        const text = c.terms.find(safeTerm)
        if (text)
          candidates.push({
            text,
            x: c.x * t.scale + t.x,
            y: -c.y * t.scale + t.y,
            size: 10,
            kind: 'word',
            region: c.region,
            id,
          })
      })
    return placeLabels(
      candidates,
      (text, size) => {
        ctx.font = `600 ${size}px ${fontFamily}`
        return ctx.measureText(text).width
      },
      size.width,
      size.height,
    )
  }, [
    snapshot,
    camera.camera.zoom,
    t.scale,
    t.x,
    t.y,
    size,
    totals,
    fontsReady,
    pins,
    anchor,
    tweetHover?.username,
    camera.ref,
    selectedRegions,
  ])

  useEffect(() => {
    const c = hovered === null ? undefined : snapshot.cells[hovered]
    onSelectionIntent(
      c
        ? snapshot.cells.flatMap((cell, i) =>
            cell.region === c.region ? [i] : [],
          )
        : null,
    )
    return () => onSelectionIntent(null)
  }, [hovered, snapshot, onSelectionIntent])

  const selectCell = (id: number, additive = false, individual = false) => {
    const ids = individual
      ? [id]
      : snapshot.cells.flatMap((cell, i) =>
          cell.region === snapshot.cells[id].region ? [i] : [],
        )
    onSelect(additive ? Array.from(new Set([...selected, ...ids])) : ids)
  }
  const atPointer = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return hitCell(snapshot, {
      x: (e.clientX - rect.left - t.x) / t.scale,
      y: (e.clientY - rect.top - t.y) / t.scale,
    })
  }
  const authorCell = tweetHover && snapshot.cells[tweetHover.cell]
  const authorPosition = authorCell
    ? { x: authorCell.x * t.scale + t.x, y: -authorCell.y * t.scale + t.y }
    : null
  const authorTooltipX = authorPosition
    ? Math.max(90, Math.min(size.width - 90, authorPosition.x))
    : 0
  const authorTooltipBelow = !!authorPosition && authorPosition.y < 48
  const cell = hovered === null ? null : snapshot.cells[hovered]
  const region = cell && snapshot.regions.find((r) => r.id === cell.region)
  return (
    <div className={styles.mapShell}>
      {finder}
      <div
        ref={camera.ref}
        className={styles.mapViewport}
        {...camera.handlers}
        onPointerDown={(e) => {
          onSelectionIntent(null)
          camera.handlers.onPointerDown(e)
        }}
        onMouseMove={(e) => {
          if (!e.buttons) setHovered(atPointer(e))
        }}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          if (!camera.moved.current) {
            const id = atPointer(e)
            id === null ? onSelect([]) : selectCell(id, e.shiftKey)
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          const id = atPointer(e)
          if (id !== null) selectCell(id, e.shiftKey, true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onSelect([])
          if (e.key === '+' || e.key === '=') camera.zoomAt(1.5)
          if (e.key === '-') camera.zoomAt(1 / 1.5)
          if (e.key === 'Home') camera.reset()
          if (e.key.startsWith('Arrow')) {
            e.preventDefault()
            const next =
              (keyboardCell +
                (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) +
                snapshot.cells.length) %
              snapshot.cells.length
            setKeyboardCell(next)
            setHovered(next)
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            selectCell(keyboardCell, false, e.shiftKey)
          }
        }}
        tabIndex={0}
        role="group"
        aria-label="Community map. Arrow keys explore cells; Enter selects a community; Shift Enter selects one hexagon; Escape clears; plus and minus zoom."
      >
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      </div>
      <div className={styles.labels}>
        {labels.map((l, i) =>
          l.kind === 'country' ? (
            <button
              key={`r${l.region}`}
              type="button"
              className={styles.country}
              style={{
                left: l.x,
                top: l.y,
                opacity: focus.size && !focus.has(l.region) ? 0.28 : 1,
              }}
              onMouseEnter={() =>
                onSelectionIntent(
                  snapshot.cells.flatMap((c, id) =>
                    c.region === l.region ? [id] : [],
                  ),
                )
              }
              onMouseLeave={() => onSelectionIntent(null)}
              onFocus={() =>
                onSelectionIntent(
                  snapshot.cells.flatMap((c, id) =>
                    c.region === l.region ? [id] : [],
                  ),
                )
              }
              onBlur={() => onSelectionIntent(null)}
              onClick={() => {
                const r = snapshot.regions.find((r) => r.id === l.region)!
                onSelect(
                  snapshot.cells.flatMap((c, id) =>
                    c.region === l.region ? [id] : [],
                  ),
                )
                camera.focus(r.x, -r.y)
              }}
            >
              {l.text}
            </button>
          ) : (
            <span
              key={`${l.kind}${i}`}
              className={
                l.kind === 'cluster'
                  ? styles.cluster
                  : l.kind === 'pin' || l.kind === 'anchor'
                    ? styles.pin
                    : styles.word
              }
              style={{
                left: l.x,
                top: l.y,
                fontSize: l.size,
                opacity: focus.size && !focus.has(l.region) ? 0.2 : 0.8,
              }}
            >
              {l.text}
            </span>
          ),
        )}
      </div>
      {tweetHover &&
        authorPosition &&
        authorPosition.x >= 0 &&
        authorPosition.x <= size.width &&
        authorPosition.y >= 0 &&
        authorPosition.y <= size.height && (
          <div
            className={styles.hoveredAuthor}
            data-side={authorTooltipBelow ? 'below' : 'above'}
            style={{
              left: authorTooltipX,
              top: authorPosition.y + (authorTooltipBelow ? 14 : -14),
            }}
          >
            @{tweetHover.username}
            <span
              className={styles.hoveredAuthorPointer}
              style={{
                left: `calc(50% + ${authorPosition.x - authorTooltipX}px)`,
              }}
              aria-hidden="true"
            />
          </div>
        )}
      <div className={styles.layers}>
        <div className={styles.segmented}>
          {(['week', 'archived'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layer === value}
              onClick={() => setLayer(value)}
            >
              {value === 'week' ? 'Activity' : 'Archived'}
            </button>
          ))}
        </div>
        {(heatTerm || layer === 'archived') && (
          <p>
            {heatTerm
              ? `“${heatTerm}” · share of member posts each month`
              : `Share of each cell’s accounts that are archived${coverageLive ? '' : ` · snapshot ${snapshot.week}`}`}
            {heatTerm && (
              <button
                type="button"
                className={styles.clearHeat}
                onClick={onClearHeat}
              >
                Clear heatmap
              </button>
            )}
            {heatStatus && (
              <>
                <br />
                {heatStatus}
                {heatStatus === 'Heat map unavailable' && (
                  <button onClick={onRetryHeat}> · Retry</button>
                )}
              </>
            )}
          </p>
        )}
      </div>
      {scrubber}
      <span className={styles.hint}>
        <span className={styles.desktopHint}>
          Scroll to zoom · Double-click a hex to select · Shift + scroll for
          page
        </span>
        <span className={styles.touchHint}>
          Pinch to zoom · Scroll to explore below
        </span>
      </span>
      {cell && (
        <div className={styles.tooltip} role="status">
          <strong>{region?.name}</strong>
          <br />
          {cell.accounts.toLocaleString()} accounts · {cell.archived} archived
          <br />
          {cell.terms.filter(safeTerm).slice(0, 2).join(' · ')}
          {pins
            .filter((p) => p.cell === hovered)
            .map((p) => (
              <div key={p.username}>@{p.username}</div>
            ))}
        </div>
      )}
    </div>
  )
})
