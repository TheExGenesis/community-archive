'use client'
import { useState } from 'react'
import { TweetAvatar } from '@/components/portal/TweetRow'
import type { Strand } from '@/lib/community-apps/types'
import { decodeTweetText } from '@/lib/tweetText'
import { STRAND_CLUSTER_NAMES } from '@/lib/community-apps/strand-cluster-names'
import { useStrandFocus } from './StrandFocus'

export type MapStrand = Pick<
  Strand,
  'id' | 'title' | 'username' | 'position' | 'mapLabel' | 'text'
> & { avatar?: string | null }
export default function StrandMinimap({
  strands,
  activeId,
  initialCluster,
}: {
  strands: MapStrand[]
  activeId?: string
  initialCluster?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const focus = useStrandFocus()
  const [highlightedCluster, setHighlightedCluster] = useState(initialCluster)
  const interactionId = hovered ?? focus?.id
  const selectedId = interactionId ?? activeId
  const focusId =
    interactionId ?? (highlightedCluster === undefined ? activeId : undefined)
  const isMuted = (strand: MapStrand) =>
    focusId
      ? strand.id !== focusId
      : highlightedCluster !== undefined &&
        strand.position?.cluster !== highlightedCluster
  const points = strands.filter((s) => s.position)
  const xs = points.map((s) => s.position!.x),
    ys = points.map((s) => s.position!.y)
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys)
  const coords = (s: MapStrand) => ({
    x:
      300 +
      ((s.position!.x - (minX + maxX) / 2) * 470) / Math.max(maxX - minX, 1),
    y:
      232.5 -
      ((s.position!.y - (minY + maxY) / 2) * 295) / Math.max(maxY - minY, 1),
  })
  const selected = points.find((s) => s.id === selectedId)
  const groups = Array.from(
    new Set(points.map((s) => s.position!.cluster)),
  ).sort((a, b) => a - b)
  const nearest = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 600,
      y = ((event.clientY - bounds.top) / bounds.height) * 440
    return points
      .map((s) => ({
        strand: s,
        distance: (coords(s).x - x) ** 2 + (coords(s).y - y) ** 2,
      }))
      .sort((a, b) => a.distance - b.distance)[0]
  }
  // When a cluster has no handwritten labels, expose two representative
  // strands: one near its center and one further away for spatial coverage.
  const clusterPoints = points.filter(
    (s) => s.position!.cluster === highlightedCluster,
  )
  const representatives = new Set<string>()
  if (clusterPoints.length && !clusterPoints.some((s) => s.mapLabel)) {
    const center = {
      x:
        clusterPoints.reduce((sum, s) => sum + s.position!.x, 0) /
        clusterPoints.length,
      y:
        clusterPoints.reduce((sum, s) => sum + s.position!.y, 0) /
        clusterPoints.length,
    }
    const distance = (s: MapStrand, p: { x: number; y: number }) =>
      (s.position!.x - p.x) ** 2 + (s.position!.y - p.y) ** 2
    const first = [...clusterPoints].sort(
      (a, b) => distance(a, center) - distance(b, center),
    )[0]
    representatives.add(first.id)
    const second = [...clusterPoints].sort(
      (a, b) => distance(b, first.position!) - distance(a, first.position!),
    )[0]
    representatives.add(second.id)
  }
  const priority = (s: MapStrand) =>
    s.id === selectedId
      ? 100
      : representatives.has(s.id)
        ? 50
        : s.position!.cluster === highlightedCluster
          ? 30
          : 0
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const labels = points
    .filter(
      (s) => s.mapLabel || s.id === selectedId || representatives.has(s.id),
    )
    .sort((a, b) => priority(b) - priority(a))
    .flatMap((s) => {
      const { x, y } = coords(s)
      const label = s.mapLabel ?? s.title
      const active = s.id === selectedId
      const lines = active
        ? (label.match(/.{1,36}(?:\s|$)|.{1,36}/g) ?? [label]).map((line) =>
            line.trim(),
          )
        : [label.length > 34 ? label.slice(0, 33) + '…' : label]
      const clusterName = active
        ? STRAND_CLUSTER_NAMES[s.position!.cluster]
        : undefined
      const w =
        (Math.max(
          ...lines.map((line) => line.length),
          clusterName ? clusterName.length * 0.78 : 0,
        ) *
          9.5) /
          zoom +
        12
      const h = (lines.length * 23 + (clusterName ? 21 : 0) + 5) / zoom
      const above = {
        x: Math.max(3, Math.min(597 - w, x - w / 2)),
        y: Math.max(3, y - 12 - h),
      }
      const candidates = active
        ? [above]
        : [
            above,
            { x: x - w / 2, y: y + 12 },
            { x: x + 13, y: y - h / 2 },
            { x: x - 13 - w, y: y - h / 2 },
          ]
      const box = candidates
        .map((p) => ({ ...p, w, h }))
        .find(
          (p) =>
            p.x >= 3 &&
            p.x + w <= 597 &&
            p.y >= 3 &&
            p.y + h <= 437 &&
            !boxes.some(
              (b) =>
                p.x < b.x + b.w + 3 &&
                p.x + p.w + 3 > b.x &&
                p.y < b.y + b.h + 2 &&
                p.y + p.h + 2 > b.y,
            ),
        )
      if (!box) return []
      boxes.push(box)
      return [{ s, lines, clusterName, box }]
    })
  return (
    <aside
      aria-label="Strands minimap"
      className="order-first border border-border bg-card p-4 [scrollbar-width:none] lg:sticky lg:top-20 lg:order-last lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">A map of ideas</h2>
        <div className="flex gap-1">
          <button
            aria-label="Zoom out on minimap"
            disabled={zoom === 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            className="h-8 w-8 border border-border disabled:opacity-30"
          >
            −
          </button>
          <button
            aria-label="Zoom in on minimap"
            disabled={zoom === 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
            className="h-8 w-8 border border-border disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Nearby dots are related strands. Ringed dots have your original map
        labels. Zoom to see more labels.
      </p>
      <div className="mt-3 max-h-[29rem] overflow-auto border border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <svg
          viewBox="0 0 600 440"
          role="group"
          aria-label="Semantic map of strands"
          style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
          onMouseMove={(event) => {
            const p = nearest(event)
            setHovered(p && p.distance <= 225 ? p.strand.id : null)
          }}
          onMouseLeave={() => setHovered(null)}
          onClick={(event) => {
            if (event.detail === 0) return
            const p = nearest(event)
            event.preventDefault()
            if (p && p.distance <= 225)
              window.location.assign(`/strands/${p.strand.id}`)
          }}
        >
          {points.map((s) => {
            const p = s.position!,
              { x, y } = coords(s),
              active = s.id === selectedId,
              muted = isMuted(s)
            return (
              <a
                key={s.id}
                href={`/strands/${s.id}`}
                aria-label={`Explore ${s.mapLabel ?? s.title}`}
                onFocus={() => setHovered(s.id)}
                onBlur={() => setHovered(null)}
              >
                <circle cx={x} cy={y} r={13} fill="transparent" />
                <circle
                  data-strand-id={s.id}
                  data-highlighted={active || undefined}
                  data-muted={muted || undefined}
                  cx={x}
                  cy={y}
                  r={active ? 10 : s.mapLabel ? 7 : 5}
                  fill={muted ? 'hsl(var(--muted-foreground))' : p.color}
                  opacity={muted ? 0.25 : 1}
                  stroke={
                    muted
                      ? 'hsl(var(--muted-foreground))'
                      : active || s.mapLabel
                        ? 'currentColor'
                        : 'hsl(var(--background))'
                  }
                  strokeWidth={active ? 3 : s.mapLabel ? 2 : 0.7}
                />
              </a>
            )
          })}
          <g pointerEvents="none" aria-hidden="true">
            {labels.map(({ s, lines, clusterName, box }) => (
              <g
                key={s.id}
                data-label-strand-id={s.id}
                data-muted={isMuted(s) || undefined}
                opacity={isMuted(s) ? 0.35 : 1}
              >
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="hsl(var(--background))"
                  opacity="0.9"
                  rx="2"
                />
                <text
                  x={box.x + 4}
                  y={box.y + 20 / zoom}
                  fontSize={18 / zoom}
                  fill={
                    isMuted(s) ? 'hsl(var(--muted-foreground))' : 'currentColor'
                  }
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x={box.x + 5} dy={i === 0 ? 0 : 23 / zoom}>
                      {line}
                    </tspan>
                  ))}
                  {clusterName && (
                    <tspan
                      x={box.x + 5}
                      dy={21 / zoom}
                      fontSize={14 / zoom}
                      opacity="0.7"
                    >
                      {clusterName}
                    </tspan>
                  )}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div
        className="min-h-24 mt-3 rounded-lg border border-border bg-background p-3 text-xs leading-5"
        aria-live="polite"
      >
        {selected ? (
          <>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Strand seed post
            </p>
            <div className="flex items-center gap-3">
              <TweetAvatar
                tweet={{
                  id: selected.id,
                  username: selected.username,
                  avatar: selected.avatar ?? null,
                }}
                size={36}
              />
              <div className="min-w-0">
                <p className="font-bold">
                  {selected.mapLabel ?? selected.title}
                </p>
                <p className="mt-1 text-muted-foreground">
                  @{selected.username} ·{' '}
                  {STRAND_CLUSTER_NAMES[selected.position!.cluster]}
                </p>
              </div>
            </div>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {decodeTweetText(selected.text)}
            </p>
            <a
              href={`/tweets/${selected.id}`}
              className="mt-2 inline-block font-semibold text-brand"
            >
              Open seed post ↗
            </a>
          </>
        ) : (
          <p className="text-muted-foreground">
            Hover a strand card, or hover or focus a dot, to read its original
            tweet.
          </p>
        )}
      </div>
      <div
        role="group"
        aria-label="Highlight a cluster"
        className="mt-3 flex flex-wrap gap-2"
      >
        <button
          type="button"
          onClick={() => setHighlightedCluster(undefined)}
          aria-pressed={highlightedCluster === undefined}
          className="border border-border px-2 py-1 text-xs aria-pressed:border-foreground"
        >
          All
        </button>
        {groups.map((group) => (
          <button
            type="button"
            key={group}
            onClick={() => setHighlightedCluster(group)}
            aria-label={`Cluster ${group + 1}: ${STRAND_CLUSTER_NAMES[group]}`}
            aria-pressed={highlightedCluster === group}
            className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs aria-pressed:border-foreground"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: points.find((s) => s.position!.cluster === group)!
                  .position!.color,
              }}
            />
            {STRAND_CLUSTER_NAMES[group]}
          </button>
        ))}
      </div>
    </aside>
  )
}
