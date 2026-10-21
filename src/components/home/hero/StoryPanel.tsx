'use client'
import { mapUrl } from '@/lib/hexMap/version'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import StoryCard from './StoryCard'
import SelectionFeed from './SelectionFeed'
import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { HexSnapshot } from '@/lib/hexMap/types'
import { coverageSummary } from '@/lib/hexMap/types'
import { safeTerm } from '@/lib/hexMap/geometry'
import type { MapStory, StoryDetail, StoryPage } from '@/lib/hexMap/stories'
import type { MapLookup } from '@/lib/hexMap/gateway'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import styles from './hero.module.css'
const TweetCard = dynamic(() => import('@/components/TweetCard'))

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(mapUrl(url.replace('/api/hex-map/', '')), {
    signal,
  })
  if (!response.ok) throw new Error('Content unavailable')
  return response.json()
}
const longDate = (value: string) =>
  new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

export default function StoryPanel({
  snapshot,
  coverageLive,
  selected,
  onClear,
  open,
  onOpen,
  onHover,
  onTweetHover,
}: {
  snapshot: HexSnapshot | null
  coverageLive: boolean
  selected: number[]
  onClear: () => void
  open: MapStory | null
  onOpen: (story: MapStory | null) => void
  onHover: (story: MapStory | null) => void
  onTweetHover: (cell?: number) => void
}) {
  const [tab, setTab] = useState<'digest' | 'strand'>('digest')
  const [selectionTab, setSelectionTab] = useState('Stories')
  const panel = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLButtonElement>(null)
  const query = useInfiniteQuery({
    queryKey: ['hex-map-stories', tab],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      json<StoryPage>(
        `/api/hex-map/stories?kind=${tab}&offset=${pageParam}`,
        signal,
      ),
    getNextPageParam: (last) => last.nextOffset,
    enabled: !open && !selected.length,
    staleTime: 60_000,
    retry: false,
  })
  const selectedIds = [...selected].sort((a, b) => a - b).join(',')
  const people = useQuery({
    queryKey: ['hex-selection-people', selectedIds],
    queryFn: ({ signal }) =>
      json<MapLookup>(`/api/hex-map/lookup?cells=${selectedIds}`, signal),
    enabled: !!selected.length && !open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const detail = useQuery({
    queryKey: ['hex-map-story', open?.kind, open?.id],
    queryFn: ({ signal }) =>
      json<StoryDetail>(
        `/api/hex-map/story?kind=${open!.kind}&id=${encodeURIComponent(open!.id)}`,
        signal,
      ),
    enabled: !!open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  useEffect(() => {
    panel.current?.scrollTo?.(0, 0)
  }, [tab, open?.id, selected])
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    data: pages,
  } = query
  useEffect(() => {
    const button = sentinel.current
    if (!button || !hasNextPage || isFetchingNextPage || isFetchNextPageError)
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void fetchNextPage()
      },
      { root: panel.current, rootMargin: '160px' },
    )
    observer.observe(button)
    return () => observer.disconnect()
  }, [
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    pages,
    open,
    selected.length,
  ])
  const active =
    snapshot && selected.length
      ? coverageSummary(selected.map((id) => snapshot.cells[id]))
      : null
  const regions = snapshot
    ? Array.from(new Set(selected.map((id) => snapshot.cells[id].region))).map(
        (id) => snapshot.regions.find((r) => r.id === id)!,
      )
    : []

  return (
    <aside
      ref={panel}
      className={styles.panel}
      aria-label="Stories from the community"
    >
      {open ? (
        <div className={styles.detail}>
          <button
            className={styles.back}
            onClick={() => {
              onOpen(null)
              onTweetHover()
            }}
          >
            ← Back to stories
          </button>
          <div className={styles.meta}>
            {open.category} · {open.date.slice(0, 10)}
          </div>
          <h2>{open.title}</h2>
          <p className={styles.lead}>{open.subtitle}</p>
          <Link href={open.href} className={styles.detailLink}>
            Read the {open.kind === 'digest' ? 'story' : 'whole strand'} ↗
          </Link>
          {detail.isPending ? (
            <p className={styles.message} role="status">
              Loading posts…
            </p>
          ) : detail.isError ? (
            <div className={styles.message}>
              Posts could not load.{' '}
              <button onClick={() => detail.refetch()}>Try again</button>
            </div>
          ) : detail.data?.tweets.length ? (
            detail.data.tweets.map(({ tweet, annotation, cell }, index) => (
              <div
                key={tweet.id}
                className={styles.tweet}
                onMouseEnter={() => onTweetHover(cell)}
                onMouseLeave={() => onTweetHover()}
              >
                {cell !== undefined &&
                  (open.kind === 'strand' ||
                    index === 0 ||
                    snapshot?.cells[cell].region !==
                      snapshot?.cells[detail.data.tweets[index - 1].cell ?? -1]
                        ?.region) && (
                    <p className={styles.sectionTitle}>
                      {
                        snapshot?.regions.find(
                          (r) => r.id === snapshot.cells[cell].region,
                        )?.name
                      }
                    </p>
                  )}
                {annotation && (
                  <div className={styles.annotation}>{annotation}</div>
                )}
                <TweetCard
                  variant="map"
                  tweet={tweet}
                  compact
                  stacked
                  showDate
                  constrainMedia
                />
              </div>
            ))
          ) : (
            <p className={styles.message}>
              No member posts are currently available for this story.
            </p>
          )}
        </div>
      ) : active ? (
        <>
          <header className={styles.selection}>
            <button className={styles.back} onClick={onClear}>
              ← Back to browse
            </button>
            <h2>
              {regions.length === 1
                ? regions[0].name
                : `${selected.length} selected cells`}
            </h2>
            <div className={styles.selectionSummary}>
              <p>
                {active.archived.toLocaleString()} of{' '}
                {active.accounts.toLocaleString()} archived
                {coverageLive ? '' : ' · snapshot'}
              </p>
              {!!people.data?.people.length && (
                <TooltipProvider delayDuration={150}>
                  <div
                    className={styles.selectionAvatars}
                    aria-label="Community members"
                  >
                    {people.data.people.slice(0, 6).map((person) => (
                      <Tooltip key={person.account_id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={'@' + person.username}
                          >
                            <Avatar className="h-6 w-6 border border-background">
                              <AvatarImage
                                src={person.avatar ?? undefined}
                                alt=""
                              />
                              <AvatarFallback>
                                {person.username[0]}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          @{person.username}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              )}
            </div>
            <p>
              {regions
                .flatMap((r) => r.terms)
                .filter(safeTerm)
                .slice(0, 5)
                .join(' · ')}
            </p>
          </header>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Selection content"
          >
            {['Stories', 'Bangers', 'Most liked', 'Latest'].map((label) => (
              <button
                role="tab"
                aria-selected={selectionTab === label}
                key={label}
                onClick={() => setSelectionTab(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <SelectionFeed
            cells={selected}
            tab={selectionTab}
            onOpen={onOpen}
            onHover={onHover}
            onTweetHover={onTweetHover}
          />
        </>
      ) : (
        <>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Browse community stories"
          >
            {(['digest', 'strand'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value)
                  onHover(null)
                }}
              >
                {value === 'digest' ? 'Digest' : 'Strands'}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            aria-label={tab === 'digest' ? 'Digest' : 'Strands'}
          >
            {query.isPending ? (
              <p className={styles.message} role="status">
                Loading {tab === 'digest' ? 'digest' : 'strands'}…
              </p>
            ) : query.isError && !query.data ? (
              <div className={styles.message}>
                Stories could not load.{' '}
                <button onClick={() => query.refetch()}>Try again</button>
              </div>
            ) : (
              query.data?.pages.map((page, i) => (
                <div key={i} className={styles.editionPage}>
                  {page.editions.map((edition) => (
                    <section className={styles.edition} key={edition.date}>
                      <h2>{longDate(edition.date)}</h2>
                      {edition.isPreview && (
                        <p className={styles.meta}>Sample edition</p>
                      )}
                      <p className={styles.lead}>{edition.headline}</p>
                      {edition.stories.map((story) => (
                        <StoryCard
                          key={story.id}
                          story={story}
                          onOpen={onOpen}
                          onHover={onHover}
                        />
                      ))}
                    </section>
                  ))}
                  {page.stories.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onOpen={onOpen}
                      onHover={onHover}
                    />
                  ))}
                </div>
              ))
            )}
            {query.data &&
              !query.data.pages.some(
                (p) => p.editions.length || p.stories.length,
              ) && <p className={styles.message}>No published stories yet.</p>}
            {query.hasNextPage && (
              <button
                ref={sentinel}
                className={styles.load}
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage
                  ? 'Loading…'
                  : query.isFetchNextPageError
                    ? 'Try loading more again'
                    : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
