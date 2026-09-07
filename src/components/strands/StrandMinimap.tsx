'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Strand } from '@/lib/community-apps/types'
import { decodeTweetText } from '@/lib/tweetText'
import { STRAND_CLUSTER_NAMES } from '@/lib/community-apps/strand-cluster-names'
import { useStrandFocus } from './StrandFocus'

export type MapStrand = Pick<
  Strand,
  'id' | 'title' | 'username' | 'position' | 'mapLabel' | 'text'
>
export default function StrandMinimap({
  strands,
  activeId,
  cluster,
  query = '',
}: {
  strands: MapStrand[]
  activeId?: string
  cluster?: number
  query?: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const focus = useStrandFocus()
  const selectedId = hovered ?? focus?.id ?? activeId
  const router = useRouter()
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
      220 -
      ((s.position!.y - (minY + maxY) / 2) * 320) / Math.max(maxY - minY, 1),
  })
  const selected = points.find((s) => s.id === selectedId)
  const groups = Array.from(
    new Set(points.map((s) => s.position!.cluster)),
  ).sort((a, b) => a - b)
  const clusterHref = (value?: number) =>
    `/strands?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(value !== undefined ? { cluster: String(value) } : {}) })}`
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
  // Keep handwritten labels legible. Zoom makes more room for labels while
  // every manually labeled dot keeps its emphasis even if its text won't fit.
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const labels = points
    .filter((s) => s.mapLabel)
    .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
    .flatMap((s) => {
      const { x, y } = coords(s),
        label = s.mapLabel!,
        short = label.length > 34 ? label.slice(0, 33) + '…' : label
      const w = (short.length * 9.5) / zoom + 8,
        h = 25 / zoom
      const candidates = [
        { x: x - w / 2, y: y - 12 - h },
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
      return [{ s, short, box }]
    })
  return (
    <aside
      aria-label="Strands minimap"
      className="order-first border border-border bg-card p-4 lg:sticky lg:top-20 lg:order-last lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
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
      <div className="mt-3 max-h-96 overflow-auto border border-border bg-background">
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
            if (p && p.distance <= 225) router.push(`/strands/${p.strand.id}`)
          }}
        >
          {points.map((s) => {
            const p = s.position!,
              { x, y } = coords(s),
              active = s.id === selectedId
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
                  cx={x}
                  cy={y}
                  r={active ? 10 : s.mapLabel ? 7 : 5}
                  fill={p.color}
                  opacity={
                    cluster !== undefined && cluster !== p.cluster ? 0.18 : 1
                  }
                  stroke={
                    active || s.mapLabel
                      ? 'currentColor'
                      : 'hsl(var(--background))'
                  }
                  strokeWidth={active ? 3 : s.mapLabel ? 2 : 0.7}
                />
              </a>
            )
          })}
          <g pointerEvents="none" aria-hidden="true">
            {labels.map(({ s, short, box }) => (
              <g key={s.id}>
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
                  y={box.y + box.h * 0.73}
                  fontSize={18 / zoom}
                  fill="currentColor"
                >
                  {short}
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
            <p className="font-bold">{selected.mapLabel ?? selected.title}</p>
            <p className="mt-1 text-muted-foreground">
              @{selected.username} ·{' '}
              {STRAND_CLUSTER_NAMES[selected.position!.cluster]}
            </p>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
              {decodeTweetText(selected.text)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Hover a strand card, or hover or focus a dot, to read its original
            tweet.
          </p>
        )}
      </div>
      <nav aria-label="Filter by cluster" className="mt-3 flex flex-wrap gap-2">
        <Link
          href={clusterHref()}
          aria-current={cluster === undefined ? 'page' : undefined}
          className="border border-border px-2 py-1 text-xs aria-[current=page]:border-foreground"
        >
          All
        </Link>
        {groups.map((group) => (
          <Link
            key={group}
            href={clusterHref(group)}
            aria-label={`Cluster ${group + 1}: ${STRAND_CLUSTER_NAMES[group]}`}
            aria-current={cluster === group ? 'page' : undefined}
            className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs aria-[current=page]:border-foreground"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: points.find((s) => s.position!.cluster === group)!
                  .position!.color,
              }}
            />
            {STRAND_CLUSTER_NAMES[group]}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
