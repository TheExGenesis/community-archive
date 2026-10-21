'use client'
import { mapUrl } from '@/lib/hexMap/version'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionReady } from '@/components/PagePerformance'
import HomepageSearch from '@/components/HomepageSearch'
import type { HexSnapshot } from '@/lib/hexMap/types'
import type { MapLookup } from '@/lib/hexMap/gateway'
import type { MapStory } from '@/lib/hexMap/stories'
import StoryPanel from './StoryPanel'
import ResizableHero from './ResizableHero'
import WhereAmI, { type SelfLocation } from './WhereAmI'
import { useSelectionPreview } from './useSelectionPreview'
import styles from './hero.module.css'
import { mapHeatOptions } from './useMapHeat'
const HexMap = dynamic(() => import('./HexMap'), {
  ssr: false,
  loading: () => (
    <div className={styles.mapShell} role="status">
      <p className={styles.message}>Loading the map…</p>
    </div>
  ),
})
const emptyCells: number[] = []

export default function HexHero({
  stats,
  trends,
}: {
  stats: ReactNode
  trends: ReactNode
}) {
  useEffect(() => {
    void import('./HexMap')
  }, [])
  const [selfLocation, setSelfLocation] = useState<SelfLocation | null>(null)
  const [selectionTab, setSelectionTab] = useState('Stories')
  const [selected, setSelected] = useState<number[]>([])
  const [hover, setHover] = useState<MapStory | null>(null)
  const [open, setOpen] = useState<MapStory | null>(null)
  const [tweetHover, setTweetHover] = useState<{
    cell: number
    username: string
  }>()
  const map = useQuery({
    queryKey: ['hex-map-meta'],
    queryFn: async ({ signal }) => {
      const response = await fetch(mapUrl('meta'), { signal })
      if (!response.ok) throw new Error('Map unavailable')
      return response.json() as Promise<HexSnapshot>
    },
    staleTime: Infinity,
    retry: false,
  })
  const [expression, setExpression] = useState('')
  const [trend, setTrend] = useState('')
  const [pinnedTrend, setPinnedTrend] = useState('')
  const [debouncedExpression, setDebouncedExpression] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedExpression(expression), 450)
    return () => clearTimeout(timer)
  }, [expression])
  const preview = trend || pinnedTrend || debouncedExpression
  const anchor = preview.match(/(?:^|\s)from:@?(\w{1,15})(?:$|\s)/i)?.[1] ?? ''
  const term = anchor ? '' : preview.trim().slice(0, 80)
  const pins = useQuery({
    queryKey: ['hex-map-pins', anchor],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        mapUrl(`lookup?name=${encodeURIComponent(anchor)}`),
        { signal },
      )
      if (!res.ok) throw new Error('Locations unavailable')
      return res.json() as Promise<MapLookup>
    },
    staleTime: 60_000,
    retry: false,
  })
  const heat = useQuery({ ...mapHeatOptions(term), enabled: !!term })
  const [monthSelection, setMonthSelection] = useState<{
    term: string
    month: number
  }>()
  const [playing, setPlaying] = useState(false)
  const lastMonth = Math.max(0, (heat.data?.months.length ?? 1) - 1)
  const month =
    monthSelection?.term === term
      ? Math.min(monthSelection.month, lastMonth)
      : lastMonth
  useEffect(() => {
    setPlaying(false)
  }, [term])
  useEffect(() => {
    if (!playing || !heat.data?.months.length) return
    const timer = setInterval(
      () =>
        setMonthSelection({
          term,
          month: (month + 1) % heat.data!.months.length,
        }),
      850,
    )
    return () => clearInterval(timer)
  }, [playing, heat.data, month, term])
  const values = heat.data?.byMonth[month]
  const currentSnapshot = useMemo(
    () =>
      map.data && pins.data
        ? {
            ...map.data,
            cells: map.data.cells.map((c, id) => ({
              ...c,
              archived: pins.data!.counts[id] ?? 0,
            })),
          }
        : map.data,
    [map.data, pins.data],
  )
  const { onSelectionIntent, preloadSelection } = useSelectionPreview(
    selectionTab,
    map.data,
  )
  const active = open ?? hover
  const visiblePins = useMemo(
    () =>
      active
        ? active.people.flatMap((p) =>
            p.cell === undefined
              ? []
              : [{ username: p.username, cell: p.cell }],
          )
        : selfLocation
          ? [selfLocation]
          : (pins.data?.people ?? []),
    [active, pins.data, selfLocation],
  )
  return (
    <section className={styles.hero} aria-label="Explore the Community Archive">
      <h1 className="sr-only">Community Archive</h1>
      <div
        className={styles.strip}
        onClickCapture={(e) => {
          const value = (e.target as HTMLElement).closest<HTMLElement>(
            '[data-map-term]',
          )?.dataset.mapTerm
          if (!value || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          setPinnedTrend(value)
          setTrend('')
        }}
        onMouseOver={(e) =>
          setTrend(
            (e.target as HTMLElement).closest<HTMLElement>('[data-map-term]')
              ?.dataset.mapTerm ?? '',
          )
        }
        onMouseLeave={() => setTrend('')}
        onFocus={(e) =>
          setTrend(
            (e.target as HTMLElement).closest<HTMLElement>('[data-map-term]')
              ?.dataset.mapTerm ?? '',
          )
        }
        onBlur={() => setTrend('')}
      >
        <div className={styles.search}>
          <HomepageSearch
            compact
            onPreview={(value) => {
              setPinnedTrend('')
              setExpression(value)
              setSelfLocation(null)
            }}
          />
        </div>
        {trends}
      </div>
      <ResizableHero>
        <div className={styles.mapColumn}>
          {map.data ? (
            <>
              <SectionReady section="homepage_hex_map" />
              <HexMap
                snapshot={currentSnapshot!}
                selfLocation={selfLocation}
                finder={
                  <WhereAmI
                    onLocated={(person) => {
                      setSelfLocation(person)
                      if (person) {
                        setSelectionTab('Stories')
                        setSelected([person.cell])
                        setOpen(null)
                        setHover(null)
                        setTweetHover(undefined)
                        preloadSelection([person.cell], 'Stories')
                      }
                    }}
                  />
                }
                coverageLive={!!pins.data}
                pins={visiblePins}
                anchor={selfLocation?.username ?? anchor}
                heat={term && heat.data ? values : undefined}
                heatTerm={term}
                heatStatus={
                  term
                    ? heat.isError
                      ? 'Heat map unavailable'
                      : heat.isFetching && !heat.data
                        ? 'Loading heat map…'
                        : !heat.data?.months.length
                          ? 'No matching monthly data'
                          : undefined
                    : undefined
                }
                onRetryHeat={() => heat.refetch()}
                onClearHeat={() => {
                  setTrend('')
                  setPinnedTrend('')
                  setExpression('')
                  setDebouncedExpression('')
                }}
                scrubber={
                  term && heat.data?.months.length ? (
                    <div className={styles.scrubber}>
                      <button
                        onClick={() => setPlaying((p) => !p)}
                        aria-label={
                          playing ? 'Pause heat map' : 'Play heat map'
                        }
                      >
                        {playing ? 'Pause' : 'Play'}
                      </button>
                      <input
                        aria-label="Heat map month"
                        type="range"
                        min={0}
                        max={heat.data.months.length - 1}
                        value={month}
                        onChange={(e) => {
                          setMonthSelection({
                            term,
                            month: Number(e.target.value),
                          })
                          setPlaying(false)
                        }}
                      />
                      <span>{heat.data.months[month]?.slice(0, 7)}</span>
                    </div>
                  ) : null
                }
                selected={selected}
                onSelectionIntent={onSelectionIntent}
                onSelect={(cells) => {
                  setSelfLocation(null)
                  onSelectionIntent(null)
                  setSelectionTab('Stories')
                  preloadSelection(cells, 'Stories')
                  setSelected(cells)
                  setOpen(null)
                  setHover(null)
                  setTweetHover(undefined)
                }}
                storyCells={active?.cells ?? emptyCells}
                origin={active?.origin}
                tweetHover={tweetHover}
              />
            </>
          ) : (
            <div className={styles.mapShell}>
              <p className={styles.message} role="status">
                {map.isError ? (
                  <>
                    The map could not load.{' '}
                    <button onClick={() => map.refetch()}>Try again</button>
                  </>
                ) : (
                  'Loading the map…'
                )}
              </p>
            </div>
          )}
          <div className={styles.stats}>{stats}</div>
        </div>
        <StoryPanel
          snapshot={currentSnapshot ?? null}
          coverageLive={!!pins.data}
          selected={selected}
          selectionTab={selectionTab}
          onSelectionTab={(tab) => {
            setSelectionTab(tab)
            setTweetHover(undefined)
          }}
          onClear={() => setSelected([])}
          open={open}
          onOpen={(story) => {
            setOpen(story)
            setTweetHover(undefined)
            setHover(null)
          }}
          onHover={setHover}
          onTweetHover={(cell, username) =>
            setTweetHover(
              cell !== undefined && username ? { cell, username } : undefined,
            )
          }
        />
      </ResizableHero>
      <Link className={styles.more} href="#daily-digest">
        Continue to the daily digest and more ↓
      </Link>
    </section>
  )
}
