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
import { useEffect, useRef, useState } from 'react'
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
}: {
  next: boolean
  loading: boolean
  error: boolean
  load: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!ref.current || !next || loading || error) return
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) load()
      },
      { root: ref.current.closest('aside'), rootMargin: '800px' },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [next, loading, error, load])
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
}: {
  snapshot: HexSnapshot | null
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
            {p.countryFallback && (
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
      {q.data &&
        !q.data.pages.some((p) => p.stories.length || p.editions.length) && (
          <p className={styles.message}>
            No stories in this area on these pages.
          </p>
        )}
      <More
        next={q.hasNextPage}
        loading={q.isFetchingNextPage}
        error={
          q.isFetchNextPageError ||
          (!q.data?.pages.at(-1)?.stories.length &&
            !q.data?.pages.at(-1)?.editions.length)
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
}: {
  snapshot: HexSnapshot | null
  cells: number[]
  tab: string
  onOpen: (s: MapStory) => void
  onHover: (s: MapStory | null) => void
  onTweetHover: (cell?: number) => void
}) {
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const ids = [...cells].sort((a, b) => a - b).join(',')
  const q = useMapFeed<MapPostPage>(
    selectionFeedPath(tab, ids, period),
    tab !== 'Stories' && tab !== 'Strands',
  )
  return (
    <div role="tabpanel">
      {tab === 'Bangers' && (
        <div className={styles.feedControls}>
          <select
            aria-label="Best time range"
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'week' | 'all')}
          >
            <option value="week">Last 7 days</option>
            <option value="all">All time</option>
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
                range applies to when the original post was published.
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
            q.data?.pages
              .flatMap((p) => p.tweets)
              .map(({ tweet, cell }) => (
                <div
                  key={tweet.id}
                  className={styles.tweet}
                  onMouseEnter={() => onTweetHover(cell)}
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
              ))
          )}
          {q.data && !q.data.pages.some((p) => p.tweets.length) && (
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
