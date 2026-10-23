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
  initialCamera,
  hitCell,
  mix,
  placeLabels,
  safeTerm,
  selectionOutline,
  selectedArchiveColor,
  transform,
  type MapLabel,
} from '@/lib/hexMap/geometry'
import { placeCallouts } from '@/lib/hexMap/callouts'
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
  selfLocations,
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
  finder?: (hasVisibleUsernames: boolean) => ReactNode
  selfLocations?: { username: string; cell: number }[]
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 800, height: 650 })
  const [showArchived, setShowArchived] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [keyboardCell, setKeyboardCell] = useState(0)
  const [fontsReady, setFontsReady] = useState(0)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const geo = useMemo(() => geometry(snapshot), [snapshot])
  const camera = useMapCamera(geo.bounds, size.width, size.height)
  const showDetails = camera.camera.zoom >= 1.5
  // Keep the first hex for double-clicks even after its single click zooms.
  const clickedCell = useRef<number | null>(null)
  const lastSelfLocations = useRef(selfLocations)
  useEffect(() => {
    if (selfLocations?.length && lastSelfLocations.current !== selfLocations) {
      const cells = selfLocations.flatMap((p) =>
        snapshot.cells[p.cell] ? [snapshot.cells[p.cell]] : [],
      )
      if (cells.length === 1) camera.focus(cells[0].x, -cells[0].y)
      else if (cells.length) camera.fit(cells.map((c) => ({ x: c.x, y: -c.y })))
    }
    lastSelfLocations.current = selfLocations
  }, [selfLocations, snapshot, camera])
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

  // Rasterize only when layer inputs change,
  // never for individual pan/zoom frames, label layout, or tweet hover.
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
      const region = snapshot.regions.find((r) => r.id === c.region)
      const color =
        (dark ? (region?.colorDark ?? region?.color) : region?.color) ??
        '#888888'
      const focused = !focus.size || focus.has(c.region)
      let fill = color
      if (showArchived || heat) {
        if (heat ? heat.get(id) : c.archived) {
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
              ? selectedArchiveColor(color, strength)
              : mix('#f3d8ad', '#b54a0c', strength)
        } else
          fill =
            focus.size && focused && !heat
              ? selectedArchiveColor(color, null)
              : mix(fill, dark ? '#18181b' : '#f4f4f5', 0.65)
      }
      ctx.globalAlpha = focused ? 1 : dark ? 0.22 : 0.34
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
  }, [geo, snapshot, showArchived, focus, dark, heat])

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
    // Keep author focus compact and constant in screen space at every zoom.
    const authorCell = tweetHover && snapshot.cells[tweetHover.cell]
    if (authorCell) {
      ctx.fillStyle = '#1e9bcd33'
      ctx.beginPath()
      ctx.arc(authorCell.x, -authorCell.y, 12 / t.scale, 0, Math.PI * 2)
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
      .sort(
        (a, b) =>
          Number(selectedRegions.has(b.id)) -
            Number(selectedRegions.has(a.id)) || totals[b.id] - totals[a.id],
      )
      .map((r) => {
        ctx.font = `${showDetails ? 700 : 500} 12px ${fontFamily}`
        const text =
          camera.camera.zoom >= 2.2 &&
          ctx.measureText(r.name).width + 26 <= size.width
            ? r.name
            : r.short
        return {
          text,
          x: r.x * t.scale + t.x,
          y: -r.y * t.scale + t.y,
          size: 12,
          kind: 'country',
          region: r.id,
        }
      })
    // Keep the overview readable; reveal signature phrases after zooming in.
    if (showDetails) {
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
    const measurements = new Map<string, number>()
    const measure = (text: string, fontSize: number) => {
      const key = `${fontSize}:${text}`
      if (measurements.has(key)) return measurements.get(key)!
      ctx.font = `${showDetails ? 700 : 600} ${fontSize}px ${fontFamily}`
      const width = ctx.measureText(text).width
      measurements.set(key, width)
      return width
    }
    const placed = placeLabels(candidates, measure, size.width, size.height)
    if (!showDetails) {
      // Preserve every normal overview label. Fit these central communities
      // into remaining space near their own region's cells.
      for (const region of [20, 9, 6]) {
        if (placed.some((label) => label.region === region)) continue
        const original = candidates.find((label) => label.region === region)!
        const label = region === 9 ? { ...original, text: 'Systems' } : original
        const anchors = snapshot.cells
          .filter((cell) => cell.region === region)
          .flatMap((cell) =>
            [0, -8, 8].flatMap((dx) =>
              [0, -8, 8].map((dy) => ({
                x: cell.x * t.scale + t.x + dx,
                y: -cell.y * t.scale + t.y + dy,
              })),
            ),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - label.x, a.y - label.y) -
              Math.hypot(b.x - label.x, b.y - label.y),
          )
        let fitted = false
        for (const fontSize of [12, 11, 10]) {
          for (const anchor of anchors) {
            const candidate = { ...label, ...anchor, size: fontSize }
            if (
              placeLabels(
                [...placed, candidate],
                measure,
                size.width,
                size.height,
              ).length > placed.length
            ) {
              placed.push(candidate)
              fitted = true
              break
            }
          }
          if (fitted) break
        }
      }
    }
    return placed
  }, [
    snapshot,
    camera.camera.zoom,
    showDetails,
    t.scale,
    t.x,
    t.y,
    size,
    totals,
    fontsReady,
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

  const selectRegion = (regionId: number, additive = false) => {
    const region = snapshot.regions.find((r) => r.id === regionId)!
    const ids = snapshot.cells.flatMap((cell, id) =>
      cell.region === regionId ? [id] : [],
    )
    onSelect(additive ? Array.from(new Set([...selected, ...ids])) : ids)
    const overview = transform(
      geo.bounds,
      size.width,
      size.height,
      initialCamera,
    )
    const wordZoom = Math.max(2.7, 34 / (snapshot.radius * 2 * overview.scale))
    camera.focus(region.x, -region.y, wordZoom)
    setHovered(null)
  }
  const selectCell = (id: number, additive = false, individual = false) => {
    if (!individual) return selectRegion(snapshot.cells[id].region, additive)
    onSelect(additive ? Array.from(new Set([...selected, id])) : [id])
  }
  const atPointer = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return hitCell(snapshot, {
      x: (e.clientX - rect.left - t.x) / t.scale,
      y: (e.clientY - rect.top - t.y) / t.scale,
    })
  }
  const callouts = useMemo(() => {
    if (typeof document === 'undefined') return []
    const ctx = document.createElement('canvas').getContext('2d')!
    const fontFamily = camera.ref.current
      ? getComputedStyle(camera.ref.current).fontFamily
      : 'sans-serif'
    const people = [
      ...(tweetHover ? [tweetHover] : []),
      ...pins.filter((p) => p.username.toLowerCase() === anchor.toLowerCase()),
      ...pins,
    ].flatMap((p) => {
      const cell = snapshot.cells[p.cell]
      return cell
        ? [
            {
              username: p.username,
              x: cell.x * t.scale + t.x,
              y: -cell.y * t.scale + t.y,
              region: cell.region,
              highlighted:
                p.username.toLowerCase() ===
                  tweetHover?.username.toLowerCase() ||
                p.username.toLowerCase() === anchor.toLowerCase() ||
                !!selfLocations?.some(
                  (person) =>
                    person.username.toLowerCase() === p.username.toLowerCase(),
                ),
            },
          ]
        : []
    })
    return placeCallouts(
      people,
      labels,
      (text, fontSize) => {
        ctx.font = `${showDetails ? 700 : 600} ${fontSize}px ${fontFamily}`
        return ctx.measureText(text).width
      },
      size.width,
      size.height,
    )
  }, [
    pins,
    selfLocations,
    tweetHover,
    anchor,
    snapshot,
    t.scale,
    t.x,
    t.y,
    labels,
    showDetails,
    size,
    camera.ref,
  ])
  const cell = hovered === null ? null : snapshot.cells[hovered]
  const region = cell && snapshot.regions.find((r) => r.id === cell.region)
  return (
    <>
      <div className={styles.mapShell}>
        {finder?.(callouts.length > 0)}
        <div
          ref={camera.ref}
          className={styles.mapSurface}
          {...camera.handlers}
          onPointerDown={(e) => {
            onSelectionIntent(null)
            camera.handlers.onPointerDown(e)
          }}
          onPointerMove={(e) => {
            camera.handlers.onPointerMove(e)
            if (e.pointerType === 'mouse' && !e.buttons)
              setHovered(atPointer(e))
            else setHovered(null)
          }}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            if ((e.target as Element).closest('button')) return
            if (
              camera.moved.current ||
              (!camera.touchInput.current && e.detail > 1)
            )
              return
            const id = atPointer(e)
            const additive = e.shiftKey
            if (camera.touchInput.current) {
              if (id !== null) selectCell(id)
              return
            }
            clickedCell.current = id
            id === null ? onSelect([]) : selectCell(id, additive)
          }}
          onDoubleClick={(e) => {
            e.preventDefault()
            if (
              camera.touchInput.current ||
              camera.moved.current ||
              (e.target as Element).closest('button')
            )
              return
            const id = clickedCell.current
            if (id !== null) selectCell(id, e.shiftKey, true)
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
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
          <label
            className={styles.archivedToggle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              role="switch"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
          <div className={styles.labels}>
            {labels.map((l, i) =>
              l.kind === 'country' ? (
                <button
                  key={`r${l.region}`}
                  type="button"
                  className={styles.country}
                  data-details={showDetails}
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
                  onClick={(e) => {
                    if (e.detail === 0 || !camera.moved.current)
                      selectRegion(l.region, e.shiftKey)
                  }}
                >
                  {l.text}
                </button>
              ) : (
                <span
                  key={`${l.kind}${i}`}
                  className={
                    l.kind === 'cluster' ? styles.cluster : styles.word
                  }
                  style={{
                    left: l.x,
                    top: l.y,
                    fontSize: l.size,
                    color: mix(
                      snapshot.regions.find((r) => r.id === l.region)?.[
                        dark ? 'colorDark' : 'color'
                      ] ?? '#888888',
                      '#18181b',
                      0.6,
                    ),
                    opacity: focus.size && !focus.has(l.region) ? 0.2 : 0.8,
                  }}
                >
                  {l.text}
                </span>
              ),
            )}
          </div>
          <div className={styles.callouts}>
            <svg
              className={styles.calloutLines}
              width={size.width}
              height={size.height}
              aria-hidden="true"
            >
              {callouts.map((p) => (
                <g
                  key={p.username}
                  opacity={
                    focus.size && !focus.has(p.region) && !p.highlighted
                      ? 0.35
                      : 1
                  }
                >
                  <path
                    d={`M${p.x},${p.y} L${p.pointer.x},${p.pointer.y}`}
                    className={styles.calloutLineHalo}
                  />
                  <path
                    d={`M${p.x},${p.y} L${p.pointer.x},${p.pointer.y}`}
                    className={styles.calloutLine}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={2.5}
                    fill="#3f3f46"
                    stroke="white"
                    strokeWidth={1}
                  />
                </g>
              ))}
            </svg>
            {callouts.map((p) => (
              <span
                key={p.username}
                className={styles.userCallout}
                data-highlighted={p.highlighted}
                style={{
                  left: p.box.x,
                  top: p.box.y,
                  width: p.box.width,
                  height: p.box.height,
                  opacity:
                    focus.size && !focus.has(p.region) && !p.highlighted
                      ? 0.35
                      : 1,
                }}
              >
                @{p.username}
              </span>
            ))}
          </div>
        </div>
        {scrubber}
        <div className={styles.mobileMapControls} aria-label="Map controls">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => camera.zoomAt(1.5)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => camera.zoomAt(1 / 1.5)}
          >
            −
          </button>
          <button type="button" onClick={() => camera.reset()}>
            Reset view
          </button>
          {!!selected.length && (
            <button type="button" onClick={() => onSelect([])}>
              Clear selection
            </button>
          )}
        </div>
        {!!selected.length && (
          <p className={styles.mobileSelection} role="status">
            {selectedRegions.size === 1
              ? snapshot.regions.find((region) =>
                  selectedRegions.has(region.id),
                )?.name
              : `${selected.length} selected cells`}{' '}
            · Stories below
          </p>
        )}
        <span className={styles.hint}>
          <span className={styles.desktopHint}>
            Cmd/Ctrl + scroll to zoom · Click a cluster to select · Double-click
            a hex to select
          </span>
          <span className={styles.touchHint}>
            Scroll with one finger. Move and zoom with two.
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
      <div className={styles.layers}>
        {(heatTerm || showArchived) && (
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
    </>
  )
})
