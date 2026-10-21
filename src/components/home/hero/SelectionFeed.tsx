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
import { Fragment, useEffect, useRef, useState } from 'react'
import { useBestFeed, bestFeedRows } from './useBestFeed'
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
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!ref.current || !next || loading || error || paused) return
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) load()
      },
      { root: ref.current.closest('aside'), rootMargin: '800px' },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [next, loading, error, paused, load])
  return next ? (
    <button className={styles.load} ref={ref} disabled={loading} onClick={load}>
      {loading ? 'Loading…' : error ? 'Retry loading more' : 'Load more'}
    </button>
  ) : null
}
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
  const hasStories = !!q.data?.pages.some(
    (page) =>
      page.stories.length ||
      page.editions.some((edition) => edition.stories.length),
  )
  const firstFallback = q.data?.pages.findIndex(
    (page) =>
      page.countryFallback &&
      (page.stories.length ||
        page.editions.some((edition) => edition.stories.length)),
  )
  useEffect(() => {
    if (q.isSuccess && !q.isFetching && !hasStories) onEmpty?.()
  }, [q.isSuccess, q.isFetching, hasStories, onEmpty])
  return (
    <section>
      {kind === 'strand' && (
        <h3 className={styles.sectionTitle}>Strands, all time</h3>
      )}
      {q.isPending ? (
        <p className={styles.message}>Loading stories…</p>
      ) : q.isError && !q.data ? (
        <p className={styles.message}>
          Stories could not load.{' '}
          <button onClick={() => q.refetch()}>Retry</button>
        </p>
      ) : (
        q.data?.pages.map((p, i) => (
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
      {q.data && !hasStories && (
        <p className={styles.message}>
          No stories in this area on these pages.
        </p>
      )}
      <More
        next={q.hasNextPage}
        loading={q.isFetchingNextPage}
        error={q.isFetchNextPageError}
        paused={
          !q.data?.pages.at(-1)?.stories.length &&
          !q.data?.pages
            .at(-1)
            ?.editions.some((edition) => edition.stories.length)
        }
        load={q.fetchNextPage}
      />
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
  const [period, setPeriod] = useState<BestPeriod>('week')
  const ids = [...cells].sort((a, b) => a - b).join(',')
  const posts = useMapFeed<MapPostPage>(
    selectionFeedPath(tab, ids, period),
    tab !== 'Stories' && tab !== 'Strands' && tab !== 'Bangers',
  )
  const best = useBestFeed(ids, period, tab === 'Bangers')
  const q = tab === 'Bangers' ? best : posts
  const rows =
    tab === 'Bangers'
      ? bestFeedRows(best.data?.pages ?? [])
      : tab === 'Stories' || tab === 'Strands'
        ? []
        : (posts.data?.pages.flatMap((p) =>
            p.tweets.map((row) => ({ ...row, heading: undefined })),
          ) ?? [])
  return (
    <div role="tabpanel">
      {tab === 'Bangers' && (
        <div className={styles.feedControls}>
          <select
            aria-label="Best time range"
            value={period}
            onChange={(e) => setPeriod(e.target.value as BestPeriod)}
          >
            {BEST_PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
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
        </div>
      )}
      {tab === 'Stories' || tab === 'Strands' ? (
        <AreaStories
          key={tab}
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
