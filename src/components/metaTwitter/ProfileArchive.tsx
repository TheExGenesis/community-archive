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
import { mutateProfileCuration } from '@/app/user/[account_id]/actions'
import type { ProfileCurationSection } from '@/lib/profileCurationState'
import { useProfileEditing } from './ProfileEditingContext'

interface SidebarData {
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  available?: boolean
}

interface MediaData {
  media: ArchiveMediaItem[]
  mediaCount: number
}

interface PeopleData {
  people: ArchivePerson[]
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
  initialSidebar?: SidebarData
}) {
  const initialFeedKey = feedKey(initialYear, 'quotes')
  const initialScopeKey = scopeKey(initialYear)
  const hasInitialSidebar = initialSidebar?.available !== false
  const [activeYear, setActiveYear] = useState<number | null>(initialYear)
  const [sort, setSort] = useState<ProfileBangerSort>('quotes')
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({
    [initialFeedKey]: initialPage,
  })
  const [mediaByScope, setMediaByScope] = useState<Record<string, MediaData>>(
    initialSidebar && hasInitialSidebar
      ? {
          [initialScopeKey]: {
            media: initialSidebar.media,
            mediaCount: initialSidebar.mediaCount,
          },
        }
      : {},
  )
  const [peopleByScope, setPeopleByScope] = useState<
    Record<string, PeopleData>
  >(
    initialSidebar && hasInitialSidebar
      ? { [initialScopeKey]: { people: initialSidebar.people } }
      : {},
  )
  const [loadingFeeds, setLoadingFeeds] = useState<Record<string, boolean>>({})
  const [failedFeeds, setFailedFeeds] = useState<Record<string, boolean>>({
    [initialFeedKey]: !initialPage.available,
  })
  const [failedMedia, setFailedMedia] = useState<Record<string, boolean>>({
    [initialScopeKey]: initialSidebar?.available === false,
  })
  const [failedPeople, setFailedPeople] = useState<Record<string, boolean>>({
    [initialScopeKey]: initialSidebar?.available === false,
  })
  const [loadingMedia, setLoadingMedia] = useState<Record<string, boolean>>({})
  const [loadingPeople, setLoadingPeople] = useState<Record<string, boolean>>(
    {},
  )
  const { editing, editSaving, setEditing, setEditSaving } = useProfileEditing()
  const [editError, setEditError] = useState<string | null>(null)
  const feedsRef = useRef(feeds)
  const mediaRef = useRef(mediaByScope)
  const peopleRef = useRef(peopleByScope)
  const feedRequests = useRef(new Map<string, Promise<void>>())
  const mediaRequests = useRef(new Map<string, Promise<void>>())
  const peopleRequests = useRef(new Map<string, Promise<void>>())
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

  const updateMedia = useCallback(
    (
      updater: (
        current: Record<string, MediaData>,
      ) => Record<string, MediaData>,
    ) => {
      setMediaByScope((current) => {
        const next = updater(current)
        mediaRef.current = next
        return next
      })
    },
    [],
  )

  const updatePeople = useCallback(
    (
      updater: (
        current: Record<string, PeopleData>,
      ) => Record<string, PeopleData>,
    ) => {
      setPeopleByScope((current) => {
        const next = updater(current)
        peopleRef.current = next
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

  const loadMedia = useCallback(
    (year: number | null) => {
      const key = scopeKey(year)
      if (mediaRef.current[key]) return Promise.resolve()
      const existing = mediaRequests.current.get(key)
      if (existing) return existing

      const params = new URLSearchParams()
      if (year !== null) params.set('year', String(year))
      const query = params.toString()
      setLoadingMedia((current) => ({ ...current, [key]: true }))
      setFailedMedia((current) => ({ ...current, [key]: false }))
      const request = fetch(
        `/api/profile/${encodeURIComponent(accountId)}/media${query ? `?${query}` : ''}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('Profile media request failed')
          const media = (await response.json()) as MediaData
          if (!Array.isArray(media.media)) {
            throw new Error('Profile media response was invalid')
          }
          updateMedia((current) => ({
            ...current,
            [key]: media,
          }))
        })
        .catch(() => {
          setFailedMedia((current) => ({ ...current, [key]: true }))
        })
        .finally(() => {
          mediaRequests.current.delete(key)
          setLoadingMedia((current) => ({ ...current, [key]: false }))
        })
      mediaRequests.current.set(key, request)
      return request
    },
    [accountId, updateMedia],
  )

  const loadPeople = useCallback(
    (year: number | null) => {
      const key = scopeKey(year)
      if (peopleRef.current[key]) return Promise.resolve()
      const existing = peopleRequests.current.get(key)
      if (existing) return existing

      const params = new URLSearchParams()
      if (year !== null) params.set('year', String(year))
      const query = params.toString()
      setLoadingPeople((current) => ({ ...current, [key]: true }))
      setFailedPeople((current) => ({ ...current, [key]: false }))
      const request = fetch(
        `/api/profile/${encodeURIComponent(accountId)}/interactions${query ? `?${query}` : ''}`,
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Profile interactions request failed')
          }
          const people = (await response.json()) as PeopleData
          if (!Array.isArray(people.people)) {
            throw new Error('Profile interactions response was invalid')
          }
          updatePeople((current) => ({ ...current, [key]: people }))
        })
        .catch(() => {
          setFailedPeople((current) => ({ ...current, [key]: true }))
        })
        .finally(() => {
          peopleRequests.current.delete(key)
          setLoadingPeople((current) => ({ ...current, [key]: false }))
        })
      peopleRequests.current.set(key, request)
      return request
    },
    [accountId, updatePeople],
  )

  const activeKey = feedKey(activeYear, sort)
  const activeFeed = feeds[activeKey]
  const activeFeedLoaded = activeFeed !== undefined
  const activeNextOffset = activeFeed?.nextOffset
  const activeFeedLoading = Boolean(loadingFeeds[activeKey])
  const activeFeedFailed = Boolean(failedFeeds[activeKey])
  const activeScopeKey = scopeKey(activeYear)
  const activeMedia = mediaByScope[activeScopeKey]
  const activePeople = peopleByScope[activeScopeKey]
  const activeMediaLoading = Boolean(loadingMedia[activeScopeKey])
  const activePeopleLoading = Boolean(loadingPeople[activeScopeKey])
  const activeMediaFailed = Boolean(failedMedia[activeScopeKey])
  const activePeopleFailed = Boolean(failedPeople[activeScopeKey])
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
    void loadMedia(activeYear)
  }, [activeYear, loadMedia])

  useEffect(() => {
    void loadPeople(activeYear)
  }, [activeYear, loadPeople])

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
      setEditing(false)
      setSort('quotes')
      setActiveYear(year)
      window.history.pushState(null, '', archiveChapterHref(basePath, year))
    },
    [activeYear, basePath, setEditing],
  )

  useEffect(() => {
    if (!editing || activeYear === null) return
    setSort('quotes')
    setActiveYear(null)
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

  const runEditMutation = useCallback(
    async (mutation: Parameters<typeof mutateProfileCuration>[0]) => {
      setEditSaving(true)
      setEditError(null)
      try {
        return await mutateProfileCuration(mutation)
      } catch (error) {
        setEditError(
          error instanceof Error
            ? error.message
            : 'That profile change could not be saved.',
        )
        return null
      } finally {
        setEditSaving(false)
      }
    },
    [setEditSaving],
  )

  const dismissItem = useCallback(
    async (section: ProfileCurationSection, itemId: string) => {
      const result = await runEditMutation({
        action: 'dismiss',
        accountId,
        section,
        itemId,
      })
      if (!result) return

      if (section === 'bangers') {
        const prefix = `${activeScopeKey}:`
        updateFeeds((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, feed]) => [
              key,
              key.startsWith(prefix)
                ? {
                    ...feed,
                    tweets: feed.tweets.filter(
                      (tweet) => tweet.tweet_id !== itemId,
                    ),
                    total: Math.max(0, feed.total - 1),
                  }
                : feed,
            ]),
          ),
        )
        return
      }

      updatePeople((current) => ({
        ...current,
        [activeScopeKey]: {
          people: (current[activeScopeKey]?.people ?? []).filter(
            (person) => person.user_id !== itemId,
          ),
        },
      }))
    },
    [accountId, activeScopeKey, runEditMutation, updateFeeds, updatePeople],
  )

  const toggleFeature = useCallback(
    async (section: ProfileCurationSection, itemId: string) => {
      const result = await runEditMutation({
        action: 'toggle-feature',
        accountId,
        section,
        itemId,
      })
      if (!result || !('isFeatured' in result)) return

      const updateItem = <
        T extends {
          curation?: { is_featured: boolean; position: number | null }
        },
      >(
        item: T,
        matches: boolean,
      ) =>
        matches
          ? {
              ...item,
              curation: {
                position: item.curation?.position ?? null,
                is_featured: result.isFeatured,
              },
            }
          : item
      const featureFirst = <
        T extends {
          curation?: { is_featured: boolean; position: number | null }
        },
      >(
        items: T[],
      ) =>
        items
          .map((item, index) => ({ item, index }))
          .sort(
            (left, right) =>
              Number(right.item.curation?.is_featured ?? false) -
                Number(left.item.curation?.is_featured ?? false) ||
              left.index - right.index,
          )
          .map(({ item }) => item)

      if (section === 'bangers') {
        const prefix = `${activeScopeKey}:`
        updateFeeds((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, feed]) => [
              key,
              key.startsWith(prefix)
                ? {
                    ...feed,
                    tweets: featureFirst(
                      feed.tweets.map((tweet) =>
                        updateItem(tweet, tweet.tweet_id === itemId),
                      ),
                    ),
                  }
                : feed,
            ]),
          ),
        )
        return
      }

      updatePeople((current) => ({
        ...current,
        [activeScopeKey]: {
          people: featureFirst(
            (current[activeScopeKey]?.people ?? []).map((person) =>
              updateItem(person, person.user_id === itemId),
            ),
          ),
        },
      }))
    },
    [accountId, activeScopeKey, runEditMutation, updateFeeds, updatePeople],
  )

  const moveItem = useCallback(
    async (
      section: ProfileCurationSection,
      itemId: string,
      direction: -1 | 1,
    ) => {
      const items: Array<BangerTweet | ArchivePerson> =
        section === 'bangers'
          ? (feedsRef.current[activeKey]?.tweets ?? [])
          : (peopleRef.current[activeScopeKey]?.people ?? [])
      const getId = (item: BangerTweet | ArchivePerson) =>
        'tweet_id' in item ? item.tweet_id : item.user_id
      const index = items.findIndex((item) => getId(item) === itemId)
      const destination = index + direction
      if (index < 0 || destination < 0 || destination >= items.length) return

      const reordered = [...items]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(destination, 0, moved)
      const result = await runEditMutation({
        action: 'reorder',
        accountId,
        section,
        itemIds: reordered.map(getId),
      })
      if (!result) return

      if (section === 'bangers') {
        const positioned = (reordered as BangerTweet[]).map(
          (item, position) => ({
            ...item,
            curation: {
              is_featured: item.curation?.is_featured ?? false,
              position,
            },
          }),
        )
        updateFeeds((current) => ({
          ...current,
          [activeKey]: { ...current[activeKey], tweets: positioned },
        }))
      } else {
        const positioned = (reordered as ArchivePerson[]).map(
          (item, position) => ({
            ...item,
            curation: {
              is_featured: item.curation?.is_featured ?? false,
              position,
            },
          }),
        )
        updatePeople((current) => ({
          ...current,
          [activeScopeKey]: { people: positioned },
        }))
      }
    },
    [
      accountId,
      activeKey,
      activeScopeKey,
      runEditMutation,
      updateFeeds,
      updatePeople,
    ],
  )

  const restoreSection = useCallback(
    async (section: ProfileCurationSection) => {
      const result = await runEditMutation({
        action: 'restore',
        accountId,
        section,
      })
      if (!result) return

      if (section === 'bangers') {
        const prefix = `${activeScopeKey}:`
        const nextFeeds = Object.fromEntries(
          Object.entries(feedsRef.current).filter(
            ([key]) => !key.startsWith(prefix),
          ),
        )
        feedsRef.current = nextFeeds
        setFeeds(nextFeeds)
        automaticallyFilledFeeds.current.delete(activeKey)
        await loadFeedPage(activeYear, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
        return
      }

      const nextPeople = { ...peopleRef.current }
      delete nextPeople[activeScopeKey]
      peopleRef.current = nextPeople
      setPeopleByScope(nextPeople)
      peopleRequests.current.delete(activeScopeKey)
      await loadPeople(activeYear)
    },
    [
      accountId,
      activeKey,
      activeScopeKey,
      activeYear,
      loadFeedPage,
      loadPeople,
      runEditMutation,
      sort,
    ],
  )

  const addTweet = useCallback(
    async (itemId: string) => {
      const result = await runEditMutation({
        action: 'add',
        accountId,
        section: 'bangers',
        itemId,
      })
      if (!result) return false

      const nextFeeds = Object.fromEntries(
        Object.entries(feedsRef.current).filter(
          ([key]) => !key.startsWith('overall:'),
        ),
      )
      feedsRef.current = nextFeeds
      setFeeds(nextFeeds)
      automaticallyFilledFeeds.current.delete(activeKey)
      await loadFeedPage(null, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
      return true
    },
    [accountId, activeKey, loadFeedPage, runEditMutation, sort],
  )

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
        media={activeMedia?.media ?? []}
        mediaCount={activeMedia?.mediaCount ?? 0}
        people={activePeople?.people ?? []}
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
