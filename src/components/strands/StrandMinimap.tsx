'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Strand } from '@/lib/community-apps/types'

export type MapStrand = Pick<Strand, 'id' | 'title' | 'username' | 'position'>
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
  const router = useRouter()
  const points = strands.filter((s) => s.position)
  const xs = points.map((s) => s.position!.x),
    ys = points.map((s) => s.position!.y)
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys)
  const scaleX = 250 / Math.max(maxX - minX, 1)
  const scaleY = 200 / Math.max(maxY - minY, 1)
  const selected = points.find((s) => s.id === (hovered ?? activeId))
  const groups = Array.from(
    new Set(points.map((s) => s.position!.cluster)),
  ).sort((a, b) => a - b)
  const clusterHref = (value?: number) =>
    `/strands?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(value !== undefined ? { cluster: String(value) } : {}) })}`
  return (
    <aside
      aria-label="Strands minimap"
      className="order-first border border-border bg-card p-4 lg:sticky lg:top-20 lg:order-last"
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
        Nearby dots are related strands. Each color is a cluster. Choose a dot
        to explore.
      </p>
      <div className="mt-3 max-h-96 overflow-auto border border-border bg-background">
        <svg
          viewBox="0 0 300 250"
          aria-label="Semantic map of strands"
          role="group"
          style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
          onClick={(event) => {
            // Dense dots overlap. Resolve the closest center instead of letting
            // SVG paint order choose a neighboring strand's invisible hit area.
            if (event.detail === 0) return // Keep native keyboard links.
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = ((event.clientX - bounds.left) / bounds.width) * 300
            const y = ((event.clientY - bounds.top) / bounds.height) * 250
            const nearest = points
              .map((s) => {
                const p = s.position!
                return {
                  strand: s,
                  distance:
                    (150 + (p.x - (minX + maxX) / 2) * scaleX - x) ** 2 +
                    (125 - (p.y - (minY + maxY) / 2) * scaleY - y) ** 2,
                }
              })
              .sort((a, b) => a.distance - b.distance)[0]
            event.preventDefault()
            if (nearest && nearest.distance <= 100)
              router.push(`/strands/${nearest.strand.id}`)
          }}
        >
          {points.map((s) => {
            const p = s.position!,
              active = s.id === (hovered ?? activeId)
            const x = 150 + (p.x - (minX + maxX) / 2) * scaleX,
              y = 125 - (p.y - (minY + maxY) / 2) * scaleY
            return (
              <a
                key={s.id}
                href={`/strands/${s.id}`}
                aria-label={`Explore ${s.title}`}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(s.id)}
                onBlur={() => setHovered(null)}
              >
                <title>{`${s.title} · @${s.username} · Cluster ${p.cluster + 1}`}</title>
                <circle cx={x} cy={y} r={9} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 6 : 3.5}
                  fill={p.color}
                  opacity={
                    cluster !== undefined && cluster !== p.cluster ? 0.15 : 1
                  }
                  stroke={active ? 'currentColor' : 'hsl(var(--background))'}
                  strokeWidth={active ? 2 : 0.5}
                />
              </a>
            )
          })}
        </svg>
      </div>
      <p className="min-h-10 mt-3 text-xs leading-5" aria-live="polite">
        {selected ? selected.title : 'Hover or focus a dot to see its strand.'}
      </p>
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
            aria-label={`Cluster ${group + 1}`}
            aria-current={cluster === group ? 'page' : undefined}
            className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs aria-[current=page]:border-foreground"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: points.find((s) => s.position!.cluster === group)!
                  .position!.color,
              }}
            />
            {group + 1}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
