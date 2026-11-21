'use client'
import { storyDetailOptions } from './useStoryDetail'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import StoryCard from './StoryCard'
import SelectionFeed from './SelectionFeed'
import WeeklyStories, { weeklyStoriesOptions } from './WeeklyStories'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { HexSnapshot } from '@/lib/hexMap/types'
import { coverageSummary } from '@/lib/hexMap/types'
import { safeTerm } from '@/lib/hexMap/geometry'
import type { MapStory } from '@/lib/hexMap/stories'
import { captureHomepageMapAction } from '@/lib/posthog'
import { homepageMapTabs } from '@/lib/productActionSchema'
import { selectionPeopleOptions } from './useSelectionPreview'
import SelectionPeople from './SelectionPeople'
import { prefetchMapFeed, selectionFeedPath } from './useMapFeed'
import styles from './hero.module.css'
import useMobileMapLayout from './useMobileMapLayout'
const TweetCard = dynamic(() => import('@/components/TweetCard'))

const todayHeading = (date: string) =>
  date === new Date().toISOString().slice(0, 10) ? 'Today' : longDate(date)

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
  selectionTab,
  onSelectionTab,
  onClear,
  open,
  onOpen,
  onHover,
  onTweetHover,
}: {
  snapshot: HexSnapshot | null
  coverageLive: boolean
  selected: number[]
  selectionTab: string
  onSelectionTab: (tab: string) => void
  onClear: () => void
  open: MapStory | null
  onOpen: (story: MapStory | null) => void
  onHover: (story: MapStory | null) => void
  onTweetHover: (cell?: number, username?: string) => void
}) {
  const mobile = useMobileMapLayout()
  const panel = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = header.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      panel.current?.style.setProperty(
        '--panel-header-height',
        `${element.getBoundingClientRect().height}px`,
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, selected.length])
  const queryClient = useQueryClient()
  // Browse is today's stories the week has not woven in yet, this week and
  // last week. The expanded weekly story survives opening a daily story and
  // coming back, because the panel stays mounted.
  const weekly = useQuery({
    ...weeklyStoriesOptions,
    enabled: !open && !selected.length,
  })
  const [expandedWeekly, setExpandedWeekly] = useState<string | null>(null)
  const selectedIds = [...selected].sort((a, b) => a - b).join(',')
  const manualTabSelection = useRef<string | null>(null)
  const showBestWhenEmpty = useCallback(() => {
    if (
      manualTabSelection.current !== selectedIds &&
      selectionTab === 'Stories'
    )
      onSelectionTab('Bangers')
  }, [selectedIds, selectionTab, onSelectionTab])
  useEffect(() => {
    manualTabSelection.current = null
  }, [selectedIds])
  const people = useQuery({
    ...selectionPeopleOptions(selectedIds),
    enabled: !!selected.length && !open,
  })
  useEffect(() => {
    if (selectedIds && !open)
      void prefetchMapFeed(
        queryClient,
        selectionFeedPath('Bangers', selectedIds),
      )
  }, [queryClient, selectedIds, open])
  const detail = useQuery({
    ...storyDetailOptions(open),
    enabled: !!open,
  })
  useEffect(() => {
    if (!mobile) panel.current?.scrollTo?.(0, 0)
  }, [selectionTab, open?.id, selected, mobile])
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
      id="hex-story-panel"
      className={styles.panel}
      aria-label="Stories from the community"
    >
      {open ? (
        <div className={styles.detail}>
          <header className={styles.panelHeader}>
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
          </header>
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
                {cell !== undefined &&
                  (open.kind === 'strand' ||
                    index === 0 ||
                    snapshot?.cells[cell].region !==
                      snapshot?.cells[detail.data.tweets[index - 1].cell ?? -1]
                        ?.region) && (
                    <p className={styles.communityLabel}>
                      {
                        snapshot?.regions.find(
                          (r) => r.id === snapshot.cells[cell].region,
                        )?.name
                      }
                    </p>
                  )}
                <div className={styles.tweet}>
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
          <div ref={header} className={styles.panelHeader}>
            <header className={styles.selection}>
              <button
                className={styles.back}
                onClick={() => {
                  captureHomepageMapAction('selection_cleared')
                  onClear()
                }}
              >
                ← Back to browse
              </button>
              <h2>
                {selected.length === 1
                  ? `Selected hexagon · ${regions[0]?.short ?? regions[0]?.name}`
                  : regions.length === 1
                    ? regions[0].name
                    : `${selected.length} selected cells`}
              </h2>
              <div className={styles.selectionSummary}>
                <p>
                  {active.archived.toLocaleString()} of{' '}
                  {active.accounts.toLocaleString()} archived
                  {coverageLive ? '' : ' · snapshot'}
                </p>
                <SelectionPeople
                  key={selectedIds}
                  cells={selectedIds}
                  preview={people.data?.people ?? []}
                  title={
                    regions.length === 1
                      ? regions[0].name
                      : `${selected.length} selected cells`
                  }
                />
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
              {homepageMapTabs.map((label) => (
                <button
                  role="tab"
                  aria-selected={selectionTab === label}
                  key={label}
                  onMouseEnter={() =>
                    void prefetchMapFeed(
                      queryClient,
                      selectionFeedPath(label, selectedIds),
                      snapshot,
                    )
                  }
                  onFocus={() =>
                    void prefetchMapFeed(
                      queryClient,
                      selectionFeedPath(label, selectedIds),
                      snapshot,
                    )
                  }
                  onClick={() => {
                    if (selectionTab !== label)
                      captureHomepageMapAction('content_tab_selected', {
                        tab: label,
                      })
                    manualTabSelection.current = selectedIds
                    onSelectionTab(label)
                  }}
                >
                  {label === 'Stories'
                    ? 'Digest'
                    : label === 'Bangers'
                      ? 'Best'
                      : label}
                </button>
              ))}
            </div>
          </div>
          <SelectionFeed
            snapshot={snapshot}
            cells={selected}
            tab={selectionTab}
            onEmptyDigest={showBestWhenEmpty}
            onOpen={onOpen}
            onHover={onHover}
            onTweetHover={onTweetHover}
          />
        </>
      ) : (
        <>
          {!weekly.data ? (
            weekly.isError ? (
              <p className={styles.message}>
                Stories could not load.{' '}
                <button onClick={() => weekly.refetch()}>Try again</button>
              </p>
            ) : (
              <p className={styles.message} role="status">
                Loading stories…
              </p>
            )
          ) : (
            <>
              {weekly.data.today && (
                <section
                  className={styles.edition}
                  aria-label={todayHeading(weekly.data.today.date)}
                >
                  <div className={styles.editionHead}>
                    <h2>{todayHeading(weekly.data.today.date)}</h2>
                    <Link
                      href={`/digest/${weekly.data.today.date}`}
                      className={styles.headLink}
                    >
                      Read the day ↗
                    </Link>
                  </div>
                  {weekly.data.today.stories.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onOpen={onOpen}
                      onHover={onHover}
                    />
                  ))}
                </section>
              )}
              <WeeklyStories
                week={weekly.data}
                heading={weekly.data.soFar ? 'This week' : 'Last week'}
                href="/digest/week"
                expanded={expandedWeekly}
                onExpand={setExpandedWeekly}
                onOpen={onOpen}
                onHover={onHover}
              />
              {weekly.data.previous && (
                <WeeklyStories
                  week={weekly.data.previous}
                  heading={weekly.data.soFar ? 'Last week' : 'The week before'}
                  href={`/digest/week/${weekly.data.previous.weekStart}`}
                  expanded={expandedWeekly}
                  onExpand={setExpandedWeekly}
                  onOpen={onOpen}
                  onHover={onHover}
                />
              )}
            </>
          )}
        </>
      )}
    </aside>
  )
}
