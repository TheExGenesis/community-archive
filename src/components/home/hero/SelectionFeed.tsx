'use client'
import dynamic from 'next/dynamic'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useRankedFeed, rankedFeedRows } from './useRankedFeed'
import {
  BEST_PERIODS,
  PERIOD_LABELS,
  type BestPeriod,
} from '@/lib/hexMap/periods'
import { useMapFeed, selectionFeedPath } from './useMapFeed'
import type { HexSnapshot } from '@/lib/hexMap/types'
import type { MapStory, StoryPage, MapPostPage } from '@/lib/hexMap/stories'
import StoryCard from './StoryCard'
import styles from './hero.module.css'
import useMobileMapLayout from './useMobileMapLayout'
const TweetCard = dynamic(() => import('@/components/TweetCard'))
function More({
  next,
  loading,
  error,
  load,
  paused = false,
}: {
  paused?: boolean
  next: boolean
  loading: boolean
  error: boolean
  load: () => void
}) {
  const mobile = useMobileMapLayout()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!ref.current || !next || loading || error || paused) return
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) load()
      },
      {
        root: mobile ? null : ref.current.closest('aside'),
        rootMargin: '800px',
      },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [next, loading, error, paused, load, mobile])
  return next ? (
    <button className={styles.load} ref={ref} disabled={loading} onClick={load}>
      {loading ? 'Loading…' : error ? 'Retry loading more' : 'Load more'}
    </button>
  ) : null
}
// A cluster's Digest tab filters the shared browse pages (two digest days for
// the whole map each), so a page often holds nothing for this area. Scan ahead
// for the reader until a screenful is visible, but bound each round so a quiet
// area cannot walk the whole archive; the reader can then ask for more.
export const AREA_SCAN_TARGET = 6
export const AREA_SCAN_PAGES = 8
const storyCount = (page: StoryPage) =>
  page.stories.length +
  page.editions.reduce((n, edition) => n + edition.stories.length, 0)
function AreaStories({
  snapshot,
  kind,
  cells,
  onOpen,
  onHover,
  onEmpty,
}: {
  snapshot: HexSnapshot | null
  onEmpty?: () => void
  kind: 'digest' | 'strand'
  cells: string
  onOpen: (s: MapStory) => void
  onHover: (s: MapStory | null) => void
}) {
  const q = useMapFeed<StoryPage>(
    `stories?kind=${kind}&cells=${cells}`,
    true,
    snapshot,
  )
  const pages = q.data?.pages ?? []
  const visible = pages.reduce((n, page) => n + storyCount(page), 0)
  const [round, setRound] = useState({ goal: AREA_SCAN_TARGET, from: 0 })
  const roundSpent = pages.length - round.from >= AREA_SCAN_PAGES
  const scanning =
    q.isSuccess &&
    !!q.hasNextPage &&
    !q.isFetchNextPageError &&
    visible < round.goal &&
    !roundSpent
  const { isFetching, fetchNextPage } = q
  // A read-ahead page can land within one render, so key on the page count too.
  useEffect(() => {
    if (scanning && !isFetching) void fetchNextPage()
  }, [scanning, isFetching, fetchNextPage, pages.length])
  const loadMore = useCallback(() => {
    if (q.isFetchNextPageError) {
      void fetchNextPage()
      return
    }
    setRound({ goal: visible + AREA_SCAN_TARGET, from: pages.length })
  }, [q.isFetchNextPageError, fetchNextPage, visible, pages.length])
  const firstFallback = pages.findIndex(
    (page) => page.countryFallback && storyCount(page) > 0,
  )
  // Empty only once the scan has run out; a failed page is not an empty area.
  const settledEmpty =
    q.isSuccess &&
    !isFetching &&
    !q.isFetchNextPageError &&
    !scanning &&
    visible === 0
  useEffect(() => {
    if (settledEmpty) onEmpty?.()
  }, [settledEmpty, onEmpty])
  return (
    <section>
      {kind === 'strand' && (
        <h3 className={styles.sectionTitle}>Strands, all time</h3>
      )}
      {q.isPending || (scanning && visible === 0) ? (
        <p className={styles.message} role="status">
          {q.isPending ? 'Loading stories…' : 'Looking for stories here…'}
        </p>
      ) : q.isError && !q.data ? (
        <p className={styles.message}>
          Stories could not load.{' '}
          <button onClick={() => q.refetch()}>Retry</button>
        </p>
      ) : (
        pages.map((p, i) => (
          <div key={i}>
            {i === firstFallback && (
              <p className={styles.sectionTitle}>From the same country</p>
            )}
            {[...p.stories, ...p.editions.flatMap((e) => e.stories)].map(
              (s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  showDate={kind === 'digest'}
                  onOpen={onOpen}
                  onHover={onHover}
                />
              ),
            )}
          </div>
        ))
      )}
      {settledEmpty && (
        <p className={styles.message}>
          {q.hasNextPage
            ? 'No stories in this area in recent digests.'
            : 'No stories in this area yet.'}
        </p>
      )}
      {!(scanning && visible === 0) && (
        <More
          next={!!q.hasNextPage}
          loading={q.isFetchingNextPage || scanning}
          error={q.isFetchNextPageError}
          // A round that ran out of pages without filling the screen waits
          // for the reader instead of letting the sentinel start another.
          paused={roundSpent && visible < round.goal}
          load={loadMore}
        />
      )}
    </section>
  )
}
export default function SelectionFeed({
  snapshot,
  cells,
  tab,
  onOpen,
  onHover,
  onTweetHover,
  onEmptyDigest,
}: {
  snapshot: HexSnapshot | null
  cells: number[]
  tab: string
  onEmptyDigest?: () => void
  onOpen: (s: MapStory) => void
  onHover: (s: MapStory | null) => void
  onTweetHover: (cell?: number, username?: string) => void
}) {
  const [bestPeriod, setBestPeriod] = useState<BestPeriod>('week')
  const [likedPeriod, setLikedPeriod] = useState<BestPeriod>('week')
  const period = tab === 'Bangers' ? bestPeriod : likedPeriod
  const setPeriod = tab === 'Bangers' ? setBestPeriod : setLikedPeriod
  const ids = [...cells].sort((a, b) => a - b).join(',')
  const posts = useMapFeed<MapPostPage>(
    selectionFeedPath(tab, ids, period),
    tab === 'Latest',
  )
  const isRanked = tab === 'Bangers' || tab === 'Most liked'
  const ranked = useRankedFeed(
    ids,
    period,
    isRanked,
    tab === 'Bangers' ? 'quotes' : 'likes',
  )
  const q = isRanked ? ranked : posts
  const rows = isRanked
    ? rankedFeedRows(ranked.data?.pages ?? [])
    : tab === 'Stories' || tab === 'Strands'
      ? []
      : (posts.data?.pages.flatMap((p) =>
          p.tweets.map((row) => ({ ...row, heading: undefined })),
        ) ?? [])
  return (
    <div role="tabpanel">
      {(tab === 'Bangers' || tab === 'Most liked') && (
        <div className={styles.feedControls}>
          <select
            aria-label={`${tab === 'Bangers' ? 'Best' : 'Most liked'} time range`}
            value={period}
            onChange={(e) => setPeriod(e.target.value as BestPeriod)}
          >
            {BEST_PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
          {tab === 'Bangers' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="How Best is calculated">
                    <Info size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  Ranked by quote tweets from Community Archive users. The time
                  range applies to when the original post was published. If the
                  week has no ranked posts, we show its most-liked posts.
                  Scrolling widens to 30 days, 90 days, 365 days, then all time
                  without repeating posts.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      {tab === 'Stories' || tab === 'Strands' ? (
        <AreaStories
          key={`${tab}:${ids}`}
          snapshot={snapshot}
          kind={tab === 'Stories' ? 'digest' : 'strand'}
          cells={ids}
          onOpen={onOpen}
          onHover={onHover}
          onEmpty={tab === 'Stories' ? onEmptyDigest : undefined}
        />
      ) : (
        <>
          {q.isPending ? (
            <p className={styles.message}>Loading posts…</p>
          ) : q.isError && !q.data ? (
            <p className={styles.message}>
              Posts could not load.{' '}
              <button onClick={() => q.refetch()}>Retry</button>
            </p>
          ) : (
            rows.map(({ tweet, cell, heading }) => (
              <Fragment key={tweet.id}>
                {heading && <h3 className={styles.feedHeading}>{heading}</h3>}
                <div
                  className={styles.tweet}
                  onMouseEnter={() => onTweetHover(cell, tweet.username)}
                  onFocusCapture={() => onTweetHover(cell, tweet.username)}
                  onBlurCapture={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    )
                      onTweetHover()
                  }}
                  onMouseLeave={() => onTweetHover()}
                >
                  <TweetCard
                    variant="map"
                    tweet={tweet}
                    compact
                    stacked
                    showDate
                    constrainMedia
                  />
                </div>
              </Fragment>
            ))
          )}
          {q.data && !rows.length && !q.hasNextPage && (
            <p className={styles.message}>
              No member posts are available in these cells.
            </p>
          )}
          <More
            next={q.hasNextPage}
            loading={q.isFetchingNextPage}
            error={q.isFetchNextPageError}
            load={q.fetchNextPage}
          />
        </>
      )}
      <p className={styles.message}>
        <Link href="/#upload-archive">Invite someone from here ↗</Link>
      </p>
    </div>
  )
}
