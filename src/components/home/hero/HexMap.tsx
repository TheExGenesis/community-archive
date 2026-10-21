'use client'

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import { SectionReady } from '@/components/PagePerformance'
import {
  coverageSummary,
  hexPoints,
  type HexSnapshot,
} from '@/lib/hexMap/types'

const number = (value: number) => value.toLocaleString('en-US')

export default function HexMap({
  stories,
  actions,
}: {
  stories: ReactNode
  actions: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<HexSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [coverage, setCoverage] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [focusCell, setFocusCell] = useState(0)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    fetch('/api/hex-map/meta', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Map unavailable')
        return response.json() as Promise<HexSnapshot>
      })
      .then(setSnapshot)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected([])
        setHovered(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const geometry = useMemo(() => {
    if (!snapshot) return null
    const xs = snapshot.cells.map((c) => c.x)
    const ys = snapshot.cells.map((c) => -c.y)
    const pad = snapshot.radius * 3
    const x = Math.min(...xs) - pad,
      y = Math.min(...ys) - pad
    const width = Math.max(...xs) - x + pad,
      height = Math.max(...ys) - y + pad
    return {
      viewBox: `${x} ${y} ${width} ${height}`,
      points: snapshot.cells.map((c) =>
        hexPoints(c.x, c.y, snapshot.radius * 0.96),
      ),
    }
  }, [snapshot])

  const totals = useMemo(
    () => (snapshot ? coverageSummary(snapshot.cells) : null),
    [snapshot],
  )
  const gaps = useMemo(
    () =>
      snapshot
        ? snapshot.regions
            .map((region) => ({
              ...region,
              ...coverageSummary(
                snapshot.cells.filter((cell) => cell.region === region.id),
              ),
            }))
            .sort((a, b) => b.accounts - b.archived - (a.accounts - a.archived))
            .slice(0, 3)
        : [],
    [snapshot],
  )
  const active =
    snapshot && selected.length
      ? coverageSummary(selected.map((id) => snapshot.cells[id]))
      : null
  const hoveredCell =
    snapshot && hovered !== null ? snapshot.cells[hovered] : null
  const activeRegion =
    snapshot && selected.length
      ? snapshot.regions.find(
          (r) => r.id === snapshot.cells[selected[0]].region,
        )
      : null
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectCell = (id: number, additive = false) => {
    setSelected((old) =>
      additive
        ? old.includes(id)
          ? old.filter((x) => x !== id)
          : [...old, id]
        : old.length === 1 && old[0] === id
          ? []
          : [id],
    )
  }

  return (
    <div className="home-fade-in mx-auto w-full max-w-[1600px] overflow-hidden rounded-xl border border-border bg-background text-left">
      <div className="grid grid-cols-1 xl:grid-cols-[22%_54%_24%]">
        <aside
          aria-label="Community stories"
          className="order-2 min-w-0 border-t border-border xl:order-1 xl:border-r xl:border-t-0"
        >
          {stories}
        </aside>
        <div className="order-1 min-w-0 xl:order-2">
          <div className="min-h-16 flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">A map of the community</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Mutual connections become neighbourhoods
              </p>
            </div>
            <button
              type="button"
              aria-pressed={coverage}
              onClick={() => setCoverage((value) => !value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${coverage ? 'border-brand bg-brand/10 text-brand-deep' : 'border-border hover:bg-muted'}`}
            >
              Archived
            </button>
          </div>
          <div className="relative bg-muted/45">
            <div className="h-[440px] overflow-auto sm:h-[560px] xl:h-[min(66vh,660px)]">
              {snapshot && geometry ? (
                <svg
                  viewBox={geometry.viewBox}
                  className="block h-full min-w-full max-w-none"
                  style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                  aria-label="Community hex map. Tab to a cell, use arrow keys to explore, Enter to select, Escape to clear."
                  onMouseLeave={() => setHovered(null)}
                >
                  <g>
                    {snapshot.cells.map((cell, id) => {
                      const region = snapshot.regions.find(
                        (r) => r.id === cell.region,
                      )
                      const color = region?.color ?? '#86a878'
                      // Keep geography visible, but make the first uploader the
                      // biggest visual jump. Selection only adds an outline.
                      const countStrength =
                        cell.archived > 0
                          ? 1 - Math.exp(-(cell.archived - 1) / 3)
                          : 0
                      const opacity = coverage
                        ? cell.archived > 0
                          ? 0.9 + 0.1 * countStrength
                          : 0.2
                        : 0.5 + 0.45 * Math.min(cell.activity / 2, 1)
                      const darkFill =
                        coverage && cell.archived > 0
                          ? `color-mix(in srgb, ${color}, white ${45 + 25 * countStrength}%)`
                          : color
                      const highlighted = selectedSet.has(id) || hovered === id
                      return (
                        <polygon
                          key={id}
                          points={geometry.points[id]}
                          fill={color}
                          style={
                            { '--hex-bright-fill': darkFill } as CSSProperties
                          }
                          fillOpacity={opacity}
                          stroke={
                            highlighted ? 'hsl(var(--brand))' : region?.color
                          }
                          strokeWidth={highlighted ? 0.09 : 0.008}
                          strokeOpacity={
                            highlighted ? 1 : coverage ? 0.12 : 0.25
                          }
                          role="button"
                          tabIndex={focusCell === id ? 0 : -1}
                          aria-label={`${region?.short ?? 'Community'}, cell ${id}: ${cell.archived} of ${cell.accounts} accounts archived`}
                          aria-pressed={selectedSet.has(id)}
                          className="cursor-pointer outline-none focus:stroke-foreground focus:[stroke-width:0.09] dark:fill-[var(--hex-bright-fill)]"
                          onMouseEnter={() => setHovered(id)}
                          onFocus={() => setHovered(id)}
                          onBlur={() => setHovered(null)}
                          onClick={(event) => {
                            setFocusCell(id)
                            selectCell(id, event.shiftKey)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              selectCell(id, event.shiftKey)
                            }
                            const direction = (
                              {
                                ArrowRight: 1,
                                ArrowLeft: -1,
                                ArrowDown: 1,
                                ArrowUp: -1,
                              } as Record<string, number>
                            )[event.key]
                            if (direction) {
                              event.preventDefault()
                              const next =
                                (id + direction + snapshot.cells.length) %
                                snapshot.cells.length
                              setFocusCell(next)
                              const elements =
                                event.currentTarget.parentElement?.children
                              ;(
                                elements?.[next] as SVGElement | undefined
                              )?.focus()
                            }
                          }}
                        />
                      )
                    })}
                  </g>
                  <g className="hidden sm:block">
                    {snapshot.regions.map((region) => (
                      <text
                        key={region.id}
                        x={region.x}
                        y={-region.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="0.39"
                        fontWeight="600"
                        fill="hsl(var(--foreground))"
                        stroke="hsl(var(--background))"
                        strokeWidth="0.075"
                        paintOrder="stroke"
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${region.name}`}
                        className="cursor-pointer outline-none focus:underline"
                        onMouseEnter={() => setHovered(null)}
                        onClick={() =>
                          setSelected(
                            snapshot.cells.flatMap((cell, i) =>
                              cell.region === region.id ? [i] : [],
                            ),
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelected(
                              snapshot.cells.flatMap((cell, i) =>
                                cell.region === region.id ? [i] : [],
                              ),
                            )
                          }
                        }}
                      >
                        {region.short}
                      </text>
                    ))}
                  </g>
                </svg>
              ) : (
                <div
                  role="status"
                  className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
                >
                  {failed ? (
                    <>
                      <p>
                        The map couldn’t load. You can still search the archive.
                      </p>
                      <button
                        className="text-brand-deep underline"
                        onClick={() => setRetry((value) => value + 1)}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="h-12 w-12 animate-pulse rounded-xl bg-brand/20" />
                      <p>Unfolding the community map…</p>
                    </>
                  )}
                </div>
              )}
            </div>
            {hoveredCell ? (
              <div
                className="pointer-events-none absolute left-3 top-3 max-w-[240px] rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-sm"
                aria-live="polite"
              >
                <p className="font-semibold">
                  {
                    snapshot?.regions.find((r) => r.id === hoveredCell.region)
                      ?.short
                  }
                </p>
                <p className="mt-1 text-muted-foreground">
                  {number(hoveredCell.accounts)} accounts ·{' '}
                  {number(hoveredCell.archived)} archived
                </p>
              </div>
            ) : null}
            <div className="absolute bottom-3 right-3 flex rounded-lg border border-border bg-background shadow-sm">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
                className="p-2 hover:bg-muted disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                aria-label="Reset map zoom"
                onClick={() => setZoom(1)}
                className="border-x border-border p-2 hover:bg-muted"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 3}
                onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
                className="p-2 hover:bg-muted disabled:opacity-30"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
            <span>
              {coverage
                ? 'Bright cells have archives · brighter means more archived accounts'
                : 'Brightness shows activity relative to each cell’s weekly average'}
            </span>
            <span>Snapshot · week of {snapshot?.week ?? '…'}</span>
          </div>
        </div>
        <aside
          aria-label="Map details"
          className="order-3 border-t border-border p-5 xl:border-l xl:border-t-0 xl:p-6"
        >
          {active && activeRegion ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Around here
                </span>
                <button
                  aria-label="Clear map selection"
                  onClick={() => setSelected([])}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X size={16} />
                </button>
              </div>
              <h2 className="mt-5 text-2xl font-semibold">
                {selected.length === 1
                  ? activeRegion.short
                  : `${selected.length} selected cells`}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {selected.length === 1
                  ? `${activeRegion.name} · Cell ${selected[0]}`
                  : 'Shift-click cells to add or remove them.'}
              </p>
              <p className="mt-6 text-3xl font-semibold tracking-tight">
                {number(active.accounts)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  accounts
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {number(active.archived)} archived ·{' '}
                {(
                  (100 * active.archived) /
                  Math.max(active.accounts, 1)
                ).toFixed(1)}
                % coverage
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: `${(100 * active.archived) / Math.max(active.accounts, 1)}%`,
                  }}
                />
              </div>
              <p className="mb-3 mt-7 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Words from this neighbourhood
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  new Set(selected.flatMap((id) => snapshot!.cells[id].terms)),
                )
                  .slice(0, 8)
                  .map((term) => (
                    <Link
                      key={term}
                      href={`/search?q=${encodeURIComponent(term)}`}
                      className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand hover:text-brand-deep"
                    >
                      {term}
                    </Link>
                  ))}
              </div>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                This is an aggregate map snapshot. Explore the archive through
                search; neighbourhood tweet feeds are still to come.
              </p>
              <Link
                href="#upload-archive"
                className="mt-5 inline-block text-sm font-semibold text-brand-deep hover:underline"
              >
                Invite someone from here ↗
              </Link>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                An open, living archive
              </span>
              <h2 className="mt-5 text-2xl font-semibold leading-tight">
                Every conversation has a place.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Explore the neighbourhoods of our corner of Twitter. Pick a cell
                to see what’s here, or a country name to explore a whole region.
              </p>
              {totals && snapshot ? (
                <>
                  <div className="my-6 grid grid-cols-2 gap-4 border-y border-border py-5">
                    <div>
                      <p className="text-2xl font-semibold">
                        {number(totals.accounts)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        accounts on the map
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">
                        {number(totals.archived)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        archived accounts
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Archives reach {number(totals.occupied)} of{' '}
                    {number(snapshot.cells.length)} cells. There’s more history
                    to preserve.
                  </p>
                  <p className="mb-3 mt-6 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Biggest gaps
                  </p>
                  <div className="space-y-3">
                    {gaps.map((region) => (
                      <button
                        key={region.id}
                        onClick={() =>
                          setSelected(
                            snapshot.cells.flatMap((cell, id) =>
                              cell.region === region.id ? [id] : [],
                            ),
                          )
                        }
                        className="flex w-full items-center justify-between gap-2 text-left text-xs hover:text-brand-deep"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: region.color }}
                          />
                          {region.short}
                        </span>
                        <span className="text-muted-foreground">
                          {number(region.accounts - region.archived)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Accounts without an archive in this snapshot
                  </p>
                </>
              ) : null}
              <div className="mt-6">{actions}</div>
            </>
          )}
        </aside>
      </div>
      {snapshot ? (
        <>
          <SectionReady section="homepage_hex_map" />
          <details className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">
              About this map · {snapshot.regions.length} regions, a partial view
              of the community
            </summary>
            <p className="mt-3 max-w-4xl leading-relaxed">
              The layout comes from 2022–2026 mutual interactions among
              Community Archive members and their mutual one-hop ties. English
              tweets with at least one like, excluding retweets, inform the
              map’s activity; mapped archive data includes zero-like tweets. Not
              every archive member is on this map. Counts describe the snapshot,
              rather than current membership. Region names are descriptive,
              approximate labels.
            </p>
          </details>
        </>
      ) : null}
    </div>
  )
}
