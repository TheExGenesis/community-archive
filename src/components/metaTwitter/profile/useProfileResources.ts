'use client'

import { useCallback, useRef, useState } from 'react'
import {
  PROFILE_BANGERS_PAGE_LIMIT,
  PROFILE_BANGERS_PRELOAD_LIMIT,
  type ProfileBangerSort,
  type ProfileBangersPageState,
} from '@/lib/metaTwitter/profilePagination'
import type { BangerTweet } from '@/lib/metaTwitter/types'
import type { SidebarData, FeedState, MediaData, PeopleData } from './types'

export const scopeKey = (year: number | null) => year?.toString() ?? 'overall'
export const feedKey = (year: number | null, sort: ProfileBangerSort) =>
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

export function useProfileResources({
  accountId,
  initialYear,
  initialPage,
  initialSidebar,
}: {
  accountId: string
  initialYear: number | null
  initialPage: ProfileBangersPageState
  initialSidebar?: SidebarData
}) {
  const initialFeedKey = feedKey(initialYear, 'quotes')
  const initialScopeKey = scopeKey(initialYear)
  const hasInitialSidebar = initialSidebar?.available !== false
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
  const feedsRef = useRef(feeds)
  const mediaRef = useRef(mediaByScope)
  const peopleRef = useRef(peopleByScope)
  const feedRequests = useRef(new Map<string, Promise<void>>())
  const mediaRequests = useRef(new Map<string, Promise<void>>())
  const peopleRequests = useRef(new Map<string, Promise<void>>())
  const automaticallyFilledFeeds = useRef(new Set<string>())
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

  const reloadFeed = useCallback(
    async (year: number | null, sort: ProfileBangerSort) => {
      const prefix = `${scopeKey(year)}:`
      const next = Object.fromEntries(
        Object.entries(feedsRef.current).filter(
          ([key]) => !key.startsWith(prefix),
        ),
      )
      feedsRef.current = next
      setFeeds(next)
      automaticallyFilledFeeds.current.delete(feedKey(year, sort))
      await loadFeedPage(year, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
    },
    [loadFeedPage],
  )

  const reloadPeople = useCallback(
    async (year: number | null) => {
      const key = scopeKey(year)
      const next = { ...peopleRef.current }
      delete next[key]
      peopleRef.current = next
      setPeopleByScope(next)
      peopleRequests.current.delete(key)
      await loadPeople(year)
    },
    [loadPeople],
  )

  const getFeed = useCallback(
    (year: number | null, sort: ProfileBangerSort) =>
      feedsRef.current[feedKey(year, sort)],
    [],
  )
  const getPeople = useCallback(
    (year: number | null) => peopleRef.current[scopeKey(year)]?.people ?? [],
    [],
  )

  const ensureFeed = useCallback(
    (year: number | null, sort: ProfileBangerSort) => {
      const key = feedKey(year, sort)
      const current = feedsRef.current[key]
      if (!current)
        return loadFeedPage(year, sort, 0, PROFILE_BANGERS_PRELOAD_LIMIT)
      if (
        current.nextOffset !== null &&
        !automaticallyFilledFeeds.current.has(key)
      ) {
        automaticallyFilledFeeds.current.add(key)
        return loadNextPage(year, sort)
      }
    },
    [loadFeedPage, loadNextPage],
  )

  return {
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
    getPeople,
    ensureFeed,
    updateFeeds,
    updatePeople,
    loadFeedPage,
    loadNextPage,
    loadMedia,
    loadPeople,
    reloadFeed,
    reloadPeople,
  }
}
export type ProfileResources = ReturnType<typeof useProfileResources>
