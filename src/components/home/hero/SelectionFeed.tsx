'use client'
import { mapUrl } from '@/lib/hexMap/version'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { MapStory, StoryPage, MapPostPage } from '@/lib/hexMap/stories'
import StoryCard from './StoryCard'
import styles from './hero.module.css'
const TweetCard = dynamic(() => import('@/components/TweetCard'))
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(mapUrl(url.replace('/api/hex-map/', '')), { signal })
  if (!r.ok) throw new Error('Content unavailable')
  return r.json()
}
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
      { root: ref.current.closest('aside'), rootMargin: '120px' },
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
  kind,
  cells,
  onOpen,
  onHover,
}: {
  kind: 'digest' | 'strand'
  cells: string
  onOpen: (s: MapStory) => void
  onHover: (s: MapStory | null) => void
}) {
  const q = useInfiniteQuery({
    queryKey: ['hex-selection-stories', kind, cells],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      json<StoryPage>(
        `/api/hex-map/stories?kind=${kind}&cells=${cells}&offset=${pageParam}`,
        signal,
      ),
    getNextPageParam: (p) => p.nextOffset,
    staleTime: 0,
    retry: false,
  })
  return (
    <section>
      <h3 className={styles.sectionTitle}>
        {kind === 'digest' ? 'Latest from the digest' : 'Strands, all time'}
      </h3>
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
  cells,
  tab,
  onOpen,
  onHover,
  onTweetHover,
}: {
  cells: number[]
  tab: string
  onOpen: (s: MapStory) => void
  onHover: (s: MapStory | null) => void
  onTweetHover: (cell?: number) => void
}) {
  const ids = [...cells].sort((a, b) => a - b).join(','),
    sort = tab === 'Bangers' ? 'quotes' : tab === 'Latest' ? 'time' : 'likes'
  const q = useInfiniteQuery({
    queryKey: ['hex-selection-posts', ids, sort],
    initialPageParam: 0,
    enabled: tab !== 'Stories' && tab !== 'Strands',
    queryFn: ({ pageParam, signal }) =>
      json<MapPostPage>(
        `/api/hex-map/posts?cells=${ids}&sort=${sort}&offset=${pageParam}`,
        signal,
      ),
    getNextPageParam: (p) => p.nextOffset,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  return (
    <div role="tabpanel">
      {tab === 'Stories' || tab === 'Strands' ? (
        <AreaStories
          key={tab}
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
              .map(({ tweet, cell, memberQuotes }) => (
                <div
                  key={tweet.id}
                  className={styles.tweet}
                  onMouseEnter={() => onTweetHover(cell)}
                  onMouseLeave={() => onTweetHover()}
                >
                  {sort === 'quotes' && (
                    <p className={styles.sectionTitle}>
                      {memberQuotes?.toLocaleString()} member quotes
                    </p>
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
