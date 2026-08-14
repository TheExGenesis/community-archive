'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveNav, archiveChapterHref, type NavChapter } from './ArchiveNav'
import { Workspace } from './Workspace'
import {
  PROFILE_BANGERS_PAGE_LIMIT,
  PROFILE_BANGERS_PRELOAD_LIMIT,
  type ProfileBangerSort,
  type ProfileBangersPageState,
} from '@/lib/metaTwitter/profilePagination'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  BangerTweet,
} from '@/lib/metaTwitter/types'

interface SidebarData {
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  available?: boolean
}

interface FeedState {
  tweets: BangerTweet[]
  total: number
  nextOffset: number | null
  available: boolean
}

const scopeKey = (year: number | null) => year?.toString() ?? 'overall'
const feedKey = (year: number | null, sort: ProfileBangerSort) =>
  `${scopeKey(year)}:${sort}`

const mergeTweets = (current: BangerTweet[], incoming: BangerTweet[]) => {
  const seen = new Set(current.map((tweet) => tweet.tweet_id))
  return [
    ...current,
    ...incoming.filter((tweet) => {
      if (seen.has(tweet.tweet_id)) return false
      seen.add(tweet.tweet_id)
      return true
    }),
  ]
}

const yearFromLocation = (chapters: NavChapter[]): number | null => {
  const value = new URL(window.location.href).searchParams.get('chapter')
  if (!value || !/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return chapters.some((chapter) => chapter.year === year) ? year : null
}

export function ProfileArchive({
  accountId,
  avatarUrl,
  basePath,
  chapters,
  displayName,
  initialYear,
  initialPage,
  initialSidebar,
}: {
  accountId: string
  avatarUrl: string | null
  basePath: string
  chapters: NavChapter[]
  displayName: string
  initialYear: number | null
  initialPage: ProfileBangersPageState
  initialSidebar: SidebarData
}) {
  const initialFeedKey = feedKey(initialYear, 'quotes')
  const [activeYear, setActiveYear] = useState<number | null>(initialYear)
  const [sort, setSort] = useState<ProfileBangerSort>('quotes')
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({
    [initialFeedKey]: initialPage,
  })
  const [sidebars, setSidebars] = useState<Record<string, SidebarData>>(
    initialSidebar.available === false
      ? {}
      : { [scopeKey(initialYear)]: initialSidebar },
  )
  const [loadingFeeds, setLoadingFeeds] = useState<Record<string, boolean>>({})
  const [failedFeeds, setFailedFeeds] = useState<Record<string, boolean>>({
    [initialFeedKey]: !initialPage.available,
  })
  const [failedSidebars, setFailedSidebars] = useState<Record<string, boolean>>(
    {
      [scopeKey(initialYear)]: initialSidebar.available === false,
    },
  )
  const [loadingSidebars, setLoadingSidebars] = useState<
    Record<string, boolean>
  >({})
  const feedsRef = useRef(feeds)
  const sidebarsRef = useRef(sidebars)
  const feedRequests = useRef(new Map<string, Promise<void>>())
  const sidebarRequests = useRef(new Map<string, Promise<void>>())
  const automaticallyFilledFeeds = useRef(new Set<string>())
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const updateFeeds = useCallback(
    (
      updater: (
        current: Record<string, FeedState>,
      ) => Record<string, FeedState>,
    ) => {
      setFeeds((current) => {
        const next = updater(current)
        feedsRef.current = next
        return next
      })
    },
    [],
  )

  const updateSidebars = useCallback(
    (
      updater: (
        current: Record<string, SidebarData>,
      ) => Record<string, SidebarData>,
    ) => {
      setSidebars((current) => {
        const next = updater(current)
        sidebarsRef.current = next
        return next
      })
    },
    [],
  )

  const loadFeedPage = useCallback(
    (
      year: number | null,
      requestedSort: ProfileBangerSort,
      offset: number,
      limit: number,
    ) => {
      const key = feedKey(year, requestedSort)
      const requestKey = `${key}:${offset}:${limit}`
      const existing = feedRequests.current.get(requestKey)
      if (existing) return existing

      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        sort: requestedSort,
      })
      if (year !== null) params.set('year', String(year))
      setLoadingFeeds((current) => ({ ...current, [key]: true }))
      setFailedFeeds((current) => ({ ...current, [key]: false }))
      const request = fetch(
        `/api/profile/${encodeURIComponent(accountId)}/bangers?${params}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('Profile bangers request failed')
          const page = (await response.json()) as ProfileBangersPageState
          if (!Array.isArray(page.tweets)) {
            throw new Error('Profile bangers response was invalid')
          }
          updateFeeds((current) => {
            const previous = current[key]
            const preserveExtendedFeed =
              offset === 0 && Boolean(previous?.tweets.length)
            return {
              ...current,
              [key]: {
                tweets: preserveExtendedFeed
                  ? mergeTweets(page.tweets, previous?.tweets ?? [])
                  : offset === 0
                    ? mergeTweets([], page.tweets)
                    : mergeTweets(previous?.tweets ?? [], page.tweets),
                total: page.total,
                nextOffset: preserveExtendedFeed
                  ? (previous?.nextOffset ?? null)
                  : page.nextOffset,
                available: page.available,
              },
            }
          })
        })
        .catch(() => {
          setFailedFeeds((current) => ({ ...current, [key]: true }))
        })
        .finally(() => {
          feedRequests.current.delete(requestKey)
          setLoadingFeeds((current) => ({ ...current, [key]: false }))
        })
      feedRequests.current.set(requestKey, request)
      return request
    },
    [accountId, updateFeeds],
  )

  const loadNextPage = useCallback(
    (year: number | null, requestedSort: ProfileBangerSort) => {
      const current = feedsRef.current[feedKey(year, requestedSort)]
      if (!current || current.nextOffset === null) return Promise.resolve()
      return loadFeedPage(
        year,
        requestedSort,
        current.nextOffset,
        PROFILE_BANGERS_PAGE_LIMIT,
      )
    },
    [loadFeedPage],
  )

  const loadSidebar = useCallback(
    (year: number | null) => {
      const key = scopeKey(year)
      if (sidebarsRef.current[key]) return Promise.resolve()
      const existing = sidebarRequests.current.get(key)
      if (existing) return existing

      const params = new URLSearchParams()
      if (year !== null) params.set('year', String(year))
      const query = params.toString()
      setLoadingSidebars((current) => ({ ...current, [key]: true }))
      setFailedSidebars((current) => ({ ...current, [key]: false }))
      const request = fetch(
        `/api/profile/${encodeURIComponent(accountId)}/sidebar${query ? `?${query}` : ''}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('Profile sidebar request failed')
          const sidebar = (await response.json()) as SidebarData
          if (!Array.isArray(sidebar.media) || !Array.isArray(sidebar.people)) {
            throw new Error('Profile sidebar response was invalid')
          }
          updateSidebars((current) => ({
            ...current,
            [key]: { ...sidebar, available: true },
          }))
        })
        .catch(() => {
          setFailedSidebars((current) => ({ ...current, [key]: true }))
        })
        .finally(() => {
          sidebarRequests.current.delete(key)
          setLoadingSidebars((current) => ({ ...current, [key]: false }))
        })
      sidebarRequests.current.set(key, request)
      return request
    },
    [accountId, updateSidebars],
  )

  const activeKey = feedKey(activeYear, sort)
  const activeFeed = feeds[activeKey]
  const activeFeedLoaded = activeFeed !== undefined
  const activeNextOffset = activeFeed?.nextOffset
  const activeFeedLoading = Boolean(loadingFeeds[activeKey])
  const activeFeedFailed = Boolean(failedFeeds[activeKey])
  const activeSidebar = sidebars[scopeKey(activeYear)]
  const activeSidebarLoading = Boolean(loadingSidebars[scopeKey(activeYear)])
  const activeSidebarFailed = Boolean(failedSidebars[scopeKey(activeYear)])
  const hasMore = activeFeedLoaded && activeNextOffset !== null

  useEffect(() => {
    const onPopState = () => {
      setSort('quotes')
      setActiveYear(yearFromLocation(chapters))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [chapters])

  useEffect(() => {
    const current = feedsRef.current[activeKey]
    if (!current) {
      void loadFeedPage(activeYear, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
      return
    }
    if (
      current.nextOffset !== null &&
      !automaticallyFilledFeeds.current.has(activeKey)
    ) {
      automaticallyFilledFeeds.current.add(activeKey)
      void loadNextPage(activeYear, sort)
    }
  }, [
    activeFeedLoaded,
    activeKey,
    activeNextOffset,
    activeYear,
    loadFeedPage,
    loadNextPage,
    sort,
  ])

  useEffect(() => {
    void loadSidebar(activeYear)
  }, [activeYear, loadSidebar])

  useEffect(() => {
    const initialFill = loadNextPage(initialYear, 'quotes')
    void initialFill.finally(() => {
      const scopes = [null, ...chapters.map((chapter) => chapter.year)].filter(
        (year) => year !== initialYear,
      )
      void Promise.allSettled(
        scopes.map((year) => {
          const key = feedKey(year, 'quotes')
          const alreadyLoading = Array.from(feedRequests.current.keys()).some(
            (requestKey) => requestKey.startsWith(`${key}:`),
          )
          if (feedsRef.current[key] || alreadyLoading) {
            return Promise.resolve()
          }
          return loadFeedPage(year, 'quotes', 0, PROFILE_BANGERS_PRELOAD_LIMIT)
        }),
      )
    })
  }, [chapters, initialYear, loadFeedPage, loadNextPage])

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
      if (year === activeYear) return
      setSort('quotes')
      setActiveYear(year)
      window.history.pushState(null, '', archiveChapterHref(basePath, year))
    },
    [activeYear, basePath],
  )

  const selectSort = useCallback((nextSort: ProfileBangerSort) => {
    setSort(nextSort)
  }, [])

  const loadMore = useCallback(() => {
    if (!activeFeed || activeFeed.available === false) {
      return loadFeedPage(activeYear, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
    }
    return loadNextPage(activeYear, sort)
  }, [activeFeed, activeYear, loadFeedPage, loadNextPage, sort])

  const contextTitle = activeYear
    ? `Best of ${activeYear}`
    : `Best of ${displayName}`

  const returnTo = archiveChapterHref(basePath, activeYear)

  return (
    <div className="grid grid-cols-1 items-start border-t border-border lg:grid-cols-[250px_1fr]">
      <ArchiveNav
        basePath={basePath}
        chapters={chapters}
        activeYear={activeYear}
        onSelect={selectChapter}
      />
      <Workspace
        key={`${activeKey}:${activeFeed ? 'ready' : 'loading'}`}
        avatarUrl={avatarUrl}
        contextTitle={contextTitle}
        tweets={activeFeed?.tweets ?? []}
        bangersAvailable={activeFeed?.available !== false}
        bangersLoading={activeFeedLoading || (!activeFeed && !activeFeedFailed)}
        media={activeSidebar?.media ?? []}
        mediaCount={activeSidebar?.mediaCount ?? 0}
        people={activeSidebar?.people ?? []}
        peopleTitle={activeYear ? `People in ${activeYear}` : 'Top people'}
        sidebarLoading={
          activeSidebarLoading || (!activeSidebar && !activeSidebarFailed)
        }
        sidebarFailed={activeSidebarFailed}
        onRetrySidebar={() => void loadSidebar(activeYear)}
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
      />
    </div>
  )
}
