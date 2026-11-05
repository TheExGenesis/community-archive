'use client'
import { MAP_REVISION, mapUrl } from '@/lib/hexMap/version'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionReady } from '@/components/PagePerformance'
import { useArchiveSearch } from '@/components/ArchiveSearchProvider'
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

export default function HexHero() {
  useEffect(() => {
    void import('./HexMap')
  }, [])
  const [showDefaultLabels, setShowDefaultLabels] = useState(true)
  const [selfLocations, setSelfLocations] = useState<SelfLocation[]>([])
  const [labelsCleared, setLabelsCleared] = useState(false)
  const [selectionTab, setSelectionTab] = useState('Stories')
  const [selected, setSelected] = useState<number[]>([])
  const [hover, setHover] = useState<MapStory | null>(null)
  const [open, setOpen] = useState<MapStory | null>(null)
  const [tweetHover, setTweetHover] = useState<{
    cell: number
    username: string
  }>()
  const map = useQuery({
    queryKey: ['hex-map-meta', MAP_REVISION],
    queryFn: async ({ signal }) => {
      const response = await fetch(mapUrl('meta'), { signal })
      if (!response.ok) throw new Error('Map unavailable')
      return response.json() as Promise<HexSnapshot>
    },
    staleTime: Infinity,
    retry: false,
  })
  const { query: expression, setQuery: setExpression } = useArchiveSearch()
  useEffect(() => {
    setSelfLocations([])
    if (expression) setLabelsCleared(false)
  }, [expression])
  const [debouncedExpression, setDebouncedExpression] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedExpression(expression), 450)
    return () => clearTimeout(timer)
  }, [expression])
  const preview = debouncedExpression
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
      labelsCleared
        ? []
        : active
          ? active.people.flatMap((p) =>
              p.cell === undefined
                ? []
                : [{ username: p.username, cell: p.cell }],
            )
          : selfLocations.length
            ? selfLocations
            : anchor || showDefaultLabels
              ? (pins.data?.people ?? [])
              : [],
    [
      active,
      pins.data,
      selfLocations,
      anchor,
      showDefaultLabels,
      labelsCleared,
    ],
  )
  return (
    <section
      id="community-map"
      className={styles.hero}
      aria-label="Explore the Community Archive"
    >
      <h2 className="sr-only">Explore the community</h2>
      <ResizableHero>
        <div className={styles.mapColumn}>
          {map.data ? (
            <>
              <SectionReady section="homepage_hex_map" />
              <HexMap
                snapshot={currentSnapshot!}
                selfLocations={selfLocations}
                finder={(hasVisibleUsernames) => (
                  <WhereAmI
                    hasVisibleUsernames={hasVisibleUsernames}
                    onLocated={(people) => {
                      setSelfLocations(people)
                      if (people.length) {
                        setLabelsCleared(false)
                        const cells = Array.from(
                          new Set(people.map((p) => p.cell)),
                        )
                        setSelectionTab('Stories')
                        setSelected(cells)
                        setOpen(null)
                        setHover(null)
                        setTweetHover(undefined)
                        preloadSelection(cells, 'Stories')
                      }
                    }}
                    onClear={() => {
                      setShowDefaultLabels(false)
                      setLabelsCleared(true)
                      setTweetHover(undefined)
                      if (anchor) {
                        setExpression('')
                        setDebouncedExpression('')
                      }
                    }}
                  />
                )}
                coverageLive={!!pins.data}
                pins={visiblePins}
                anchor={labelsCleared ? '' : anchor}
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
                tweetHover={labelsCleared ? undefined : tweetHover}
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
            if (story) setLabelsCleared(false)
            setOpen(story)
            setTweetHover(undefined)
            setHover(null)
          }}
          onHover={(story) => {
            if (story) setLabelsCleared(false)
            setHover(story)
          }}
          onTweetHover={(cell, username) =>
            setTweetHover(
              cell !== undefined && username ? { cell, username } : undefined,
            )
          }
        />
      </ResizableHero>
      <Link className={styles.more} href="#daily-digest">
        Read the Daily Digest ↓
      </Link>
    </section>
  )
}
