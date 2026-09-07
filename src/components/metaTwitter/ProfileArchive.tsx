'use client'

import { useReportSectionReady } from '@/components/PagePerformance'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveNav, archiveChapterHref, type NavChapter } from './ArchiveNav'
import { Workspace } from './Workspace'
import {
  PROFILE_BANGERS_PRELOAD_LIMIT,
  type ProfileBangerSort,
  type ProfileBangersPageState,
} from '@/lib/metaTwitter/profilePagination'
import {
  chapterSectionTweets,
  type ChapterSection,
  type SectionsByYear,
} from '@/lib/metaTwitter/chapterSections'
import { useProfileEditing } from './ProfileEditingContext'
import {
  useProfileResources,
  feedKey,
  scopeKey,
} from './profile/useProfileResources'
import { useProfileCuration } from './profile/useProfileCuration'
import type { SidebarData } from './profile/types'

const EMPTY_SECTIONS: ChapterSection[] = []
const EMPTY_SECTIONS_BY_YEAR: SectionsByYear = {}

const yearFromLocation = (chapters: NavChapter[]): number | null => {
  const value = new URL(window.location.href).searchParams.get('chapter')
  if (!value || !/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return chapters.some((chapter) => chapter.year === year) ? year : null
}

const sectionFromLocation = () =>
  new URL(window.location.href).searchParams.get('section')

export function ProfileArchive({
  accountId,
  avatarUrl,
  basePath,
  chapters,
  displayName,
  initialYear,
  initialSectionSlug = null,
  initialPage,
  initialSidebar,
  sectionsByYear = EMPTY_SECTIONS_BY_YEAR,
}: {
  accountId: string
  avatarUrl: string | null
  basePath: string
  chapters: NavChapter[]
  displayName: string
  initialYear: number | null
  initialSectionSlug?: string | null
  initialPage: ProfileBangersPageState
  initialSidebar?: SidebarData
  /** Curated or generated sections per chapter year, catch-alls included. */
  sectionsByYear?: SectionsByYear
  /** Shown under the chapter list, e.g. why there are no sections. */
}) {
  const [activeYear, setActiveYear] = useState<number | null>(initialYear)
  const [activeSectionSlug, setActiveSectionSlug] = useState<string | null>(
    (initialYear !== null &&
      sectionsByYear[initialYear]?.find(
        (section) => section.slug === initialSectionSlug,
      )?.slug) ||
      null,
  )
  const [sort, setSort] = useState<ProfileBangerSort>('quotes')
  const { editing, editSaving, setEditing, setEditSaving } = useProfileEditing()
  const resources = useProfileResources({
    accountId,
    initialYear,
    initialPage,
    initialSidebar,
  })
  const {
    feeds,
    mediaByScope,
    peopleByScope,
    loadingFeeds,
    failedFeeds,
    failedMedia,
    failedPeople,
    loadingMedia,
    loadingPeople,
    getFeed,
    ensureFeed,
    loadFeedPage,
    loadNextPage,
    loadMedia,
    loadPeople,
  } = resources
  const {
    editError,
    dismissedItem,
    undoDismissItem,
    dismissItem,
    toggleFeature,
    moveItem,
    restoreSection,
    addTweet,
  } = useProfileCuration({
    accountId,
    activeYear,
    sort,
    resources,
    setEditSaving,
  })
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const activeKey = feedKey(activeYear, sort)
  const activeFeed = feeds[activeKey]
  const activeFeedLoaded = activeFeed !== undefined
  const activeNextOffset = activeFeed?.nextOffset
  const activeFeedLoading = Boolean(loadingFeeds[activeKey])
  const activeFeedFailed = Boolean(failedFeeds[activeKey])
  useReportSectionReady('profile_feed', activeFeedLoaded && !activeFeedFailed)
  const activeScopeKey = scopeKey(activeYear)
  const activeMedia = mediaByScope[activeScopeKey]
  const activePeople = peopleByScope[activeScopeKey]
  const activeMediaLoading = Boolean(loadingMedia[activeScopeKey])
  const activePeopleLoading = Boolean(loadingPeople[activeScopeKey])
  const activeMediaFailed = Boolean(failedMedia[activeScopeKey])
  const activePeopleFailed = Boolean(failedPeople[activeScopeKey])
  const hasMore = activeFeedLoaded && activeNextOffset !== null
  const activeSections =
    activeYear === null
      ? EMPTY_SECTIONS
      : (sectionsByYear[activeYear] ?? EMPTY_SECTIONS)
  const activeSection =
    activeSections.find((section) => section.slug === activeSectionSlug) ?? null
  const sectionTweets = activeSection
    ? chapterSectionTweets(
        activeSections,
        activeSection,
        activeFeed?.tweets ?? [],
      )
    : (activeFeed?.tweets ?? [])

  // A section filters the chapter in the client, so the rest of the chapter's
  // pages have to arrive before an empty section means anything.
  useEffect(() => {
    if (!activeSection || !hasMore || activeFeedLoading || activeFeedFailed) {
      return
    }
    void loadNextPage(activeYear, sort)
  }, [
    activeFeedFailed,
    activeFeedLoading,
    activeNextOffset,
    activeSection,
    activeYear,
    hasMore,
    loadNextPage,
    sort,
  ])

  useEffect(() => {
    const onPopState = () => {
      const year = yearFromLocation(chapters)
      setSort('quotes')
      setActiveYear(year)
      const slug = sectionFromLocation()
      setActiveSectionSlug(
        (year !== null &&
          sectionsByYear[year]?.find((section) => section.slug === slug)
            ?.slug) ||
          null,
      )
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [chapters, sectionsByYear])

  useEffect(() => {
    void ensureFeed(activeYear, sort)
  }, [activeFeedLoaded, activeNextOffset, activeYear, ensureFeed, sort])

  useEffect(() => {
    void loadMedia(activeYear)
  }, [activeYear, loadMedia])

  useEffect(() => {
    void loadPeople(activeYear)
  }, [activeYear, loadPeople])

  // Only speculative chapter reads are gated; choosing a chapter always loads it.
  const preloadingChapter = useRef(false)
  const prefetchChapter = useCallback(
    (year: number | null) => {
      if (preloadingChapter.current || getFeed(year, 'quotes')) return
      preloadingChapter.current = true
      void loadFeedPage(
        year,
        'quotes',
        0,
        PROFILE_BANGERS_PRELOAD_LIMIT,
      ).finally(() => {
        preloadingChapter.current = false
      })
    },
    [getFeed, loadFeedPage],
  )

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || activeFeedLoading || activeFeedFailed) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage(activeYear, sort)
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [
    activeFeedFailed,
    activeFeedLoading,
    activeYear,
    hasMore,
    loadNextPage,
    sort,
  ])

  const selectChapter = useCallback(
    (year: number | null) => {
      if (year === activeYear && activeSectionSlug === null) return
      setEditing(false)
      setSort('quotes')
      setActiveYear(year)
      setActiveSectionSlug(null)
      window.history.pushState(null, '', archiveChapterHref(basePath, year))
    },
    [activeSectionSlug, activeYear, basePath, setEditing],
  )

  const selectSection = useCallback(
    (year: number, slug: string | null) => {
      if (year !== activeYear) {
        setEditing(false)
        setSort('quotes')
        setActiveYear(year)
      }
      setActiveSectionSlug(slug)
      window.history.pushState(
        null,
        '',
        archiveChapterHref(basePath, year, slug),
      )
    },
    [activeYear, basePath, setEditing],
  )

  useEffect(() => {
    if (!editing || activeYear === null) return
    setSort('quotes')
    setActiveYear(null)
    setActiveSectionSlug(null)
    window.history.pushState(null, '', archiveChapterHref(basePath, null))
  }, [activeYear, basePath, editing])

  const selectSort = useCallback((nextSort: ProfileBangerSort) => {
    setSort(nextSort)
  }, [])

  const loadMore = useCallback(() => {
    if (!activeFeed || activeFeed.available === false) {
      return loadFeedPage(activeYear, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
    }
    return loadNextPage(activeYear, sort)
  }, [activeFeed, activeYear, loadFeedPage, loadNextPage, sort])

  const contextTitle = activeSection
    ? activeSection.title
    : activeYear
      ? `Best of ${activeYear}`
      : `Best of ${displayName}`

  const returnTo = archiveChapterHref(
    basePath,
    activeYear,
    activeSection?.slug ?? null,
  )

  return (
    <div className="grid grid-cols-1 items-start border-t border-border lg:grid-cols-[250px_1fr]">
      <ArchiveNav
        basePath={basePath}
        chapters={chapters}
        activeYear={activeYear}
        sectionsByYear={sectionsByYear}
        activeSectionSlug={activeSection?.slug ?? null}
        onSelect={selectChapter}
        onIntent={prefetchChapter}
        onSelectSection={selectSection}
      />
      <Workspace
        key={`${activeKey}:${activeFeed ? 'ready' : 'loading'}`}
        avatarUrl={avatarUrl}
        contextTitle={contextTitle}
        tweets={sectionTweets}
        bangersAvailable={activeFeed?.available !== false}
        bangersLoading={activeFeedLoading || (!activeFeed && !activeFeedFailed)}
        media={activeMedia?.media ?? []}
        mediaCount={activeMedia?.mediaCount ?? 0}
        people={(activePeople?.people ?? []).slice(0, 8)}
        peopleTitle={activeYear ? `People in ${activeYear}` : 'Top people'}
        mediaLoading={
          activeMediaLoading || (!activeMedia && !activeMediaFailed)
        }
        mediaFailed={activeMediaFailed}
        onRetryMedia={() => void loadMedia(activeYear)}
        peopleLoading={
          activePeopleLoading || (!activePeople && !activePeopleFailed)
        }
        peopleFailed={activePeopleFailed}
        onRetryPeople={() => void loadPeople(activeYear)}
        sort={sort}
        onSortChange={selectSort}
        hasMore={
          hasMore ||
          (activeFeedFailed && (!activeFeed || activeFeed.available === false))
        }
        loadMoreFailed={activeFeedFailed}
        onLoadMore={() => void loadMore()}
        loadMoreRef={loadMoreRef}
        returnTo={returnTo}
        editing={editing && activeYear === null}
        editSaving={editSaving}
        editError={editError}
        undoDismissAvailable={dismissedItem !== null}
        onUndoDismiss={() => void undoDismissItem()}
        onDismiss={(section, itemId) => void dismissItem(section, itemId)}
        onToggleFeature={(section, itemId) =>
          void toggleFeature(section, itemId)
        }
        onMove={(section, itemId, direction) =>
          void moveItem(section, itemId, direction)
        }
        onRestore={(section) => void restoreSection(section)}
        onAddTweet={addTweet}
      />
    </div>
  )
}
