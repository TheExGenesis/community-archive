'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, Shuffle, X } from 'lucide-react'
import {
  EMPTY_TUBE_FILTERS,
  filtersFromParams,
  filtersToQuery,
  rankTube,
  type TubeFilters,
  type TubeSort,
} from '@/lib/tube'
import { useTube } from './TubeProvider'
import { TubeStatus, VideoGrid } from './VideoCards'

const PAGE = 48

const SORTS: [TubeSort, string][] = [
  ['best', 'Best for you'],
  ['shared', 'Most shared'],
  ['recent', 'Recently shared'],
  ['oldest', 'Oldest first'],
  ['likes', 'Most loved per share'],
]

const ERAS: [TubeFilters['era'], string][] = [
  ['year', 'Past year'],
  ['2020s', '2020s'],
  ['2010s', '2010s'],
]

export function TubeHome() {
  const { data, state, seed, reshuffle } = useTube()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  // Links from the first version used /tube?v=<id>.
  useEffect(() => {
    const v = params.get('v')
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) router.replace(`/tube/watch/${v}`)
  }, [params, router])

  useEffect(() => setLimit(PAGE), [filters])

  const set = (patch: Partial<TubeFilters>) =>
    router.push(`${pathname}${filtersToQuery({ ...filters, ...patch })}`, {
      scroll: false,
    })

  // Personal ranking is frozen per visit so cards don't jump under the cursor.
  const ranked = useMemo(
    () => (data ? rankTube(data, state, filters, seed) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filters, seed, state.disliked],
  )

  const types = useMemo(
    () => facet(data?.videos.map((v) => v.type)),
    [data],
  )
  const cats = useMemo(() => facet(data?.videos.map((v) => v.cat)), [data])

  if (!data) return <TubeStatus />

  const active = filtersToQuery({ ...filters, q: '' }) !== ''

  return (
    <div className="px-4 pb-16 pt-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip on={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </Chip>
        <Chip on={!filters.cat && !filters.gems} onClick={() => set({ cat: '', sub: '', gems: false })}>
          All
        </Chip>
        <Chip on={filters.gems} onClick={() => set({ gems: !filters.gems })}>
          Hidden gems
        </Chip>
        {cats.slice(0, 8).map(([c]) => (
          <Chip key={c} on={filters.cat === c} onClick={() => set({ cat: filters.cat === c ? '' : c, sub: '' })}>
            {c}
          </Chip>
        ))}
        {filters.sort === 'best' && (
          <button
            type="button"
            onClick={reshuffle}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <Shuffle className="h-4 w-4" /> Shuffle
          </button>
        )}
      </div>

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border pb-6 sm:grid-cols-3 lg:grid-cols-5">
          <Facet title="Shared">
            {ERAS.map(([k, label]) => (
              <Opt key={k} on={filters.era === k} onClick={() => set({ era: filters.era === k ? '' : k })}>
                {label}
              </Opt>
            ))}
          </Facet>
          {types.length > 0 && (
            <Facet title="Type">
              {types.map(([t]) => (
                <Opt key={t} on={filters.type === t} onClick={() => set({ type: filters.type === t ? '' : t })}>
                  {t}
                </Opt>
              ))}
            </Facet>
          )}
          {cats.length > 0 && (
            <Facet title="Category">
              {cats.map(([c]) => (
                <Opt key={c} on={filters.cat === c} onClick={() => set({ cat: filters.cat === c ? '' : c, sub: '' })}>
                  {c}
                </Opt>
              ))}
            </Facet>
          )}
          <Facet title="Features">
            <Opt on={filters.gems} onClick={() => set({ gems: !filters.gems })}>
              Hidden gems
            </Opt>
            {data.videos.some((v) => v.ev !== undefined) && (
              <Opt on={filters.evergreen} onClick={() => set({ evergreen: !filters.evergreen })}>
                Evergreen only
              </Opt>
            )}
          </Facet>
          <Facet title="Sort by">
            {SORTS.map(([k, label]) => (
              <Opt key={k} on={filters.sort === k} onClick={() => set({ sort: k })}>
                {label}
              </Opt>
            ))}
          </Facet>
        </div>
      )}

      {(filters.q || active) && (
        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {ranked.length.toLocaleString()} videos
            {filters.q ? ` matching “${filters.q}”` : ''}
            {filters.sub ? ` in ${filters.sub}` : ''}
          </span>
          <button
            type="button"
            onClick={() => router.push(`/tube${filtersToQuery({ ...EMPTY_TUBE_FILTERS })}`)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      )}

      <VideoGrid videos={ranked.slice(0, limit)} />

      {ranked.length > limit && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-full bg-muted px-5 py-2 text-sm font-medium hover:bg-muted/70"
          >
            Show more
          </button>
        </div>
      )}
      {ranked.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">No videos match.</p>
      )}
    </div>
  )
}

function facet(values: (string | undefined)[] | undefined): [string, number][] {
  const counts = new Map<string, number>()
  for (const v of values ?? []) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        on ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/70'
      }`}
    >
      {children}
    </button>
  )
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col items-start gap-1">{children}</div>
    </div>
  )
}

function Opt({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-sm first-letter:uppercase ${
        on ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
