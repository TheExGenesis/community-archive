'use client'

import { useCallback, useEffect, useState } from 'react'
import { capturePostHogEvent } from '@/lib/posthog'
import { mutateProfileCuration } from '@/app/user/[account_id]/actions'
import type { ProfileCurationSection } from '@/lib/profileCurationState'
import type { ProfileBangerSort } from '@/lib/metaTwitter/profilePagination'
import type { ArchivePerson, BangerTweet } from '@/lib/metaTwitter/types'
import type { DismissedItem } from './types'
import { feedKey, scopeKey, type ProfileResources } from './useProfileResources'

export function useProfileCuration({
  accountId,
  activeYear,
  sort,
  resources,
  setEditSaving,
}: {
  accountId: string
  activeYear: number | null
  sort: ProfileBangerSort
  resources: ProfileResources
  setEditSaving: (saving: boolean) => void
}) {
  const activeKey = feedKey(activeYear, sort)
  const activeScopeKey = scopeKey(activeYear)
  const {
    updateFeeds,
    updatePeople,
    getFeed,
    getPeople,
    reloadFeed,
    reloadPeople,
  } = resources
  const [editError, setEditError] = useState<string | null>(null)
  const [dismissedItem, setDismissedItem] = useState<DismissedItem | null>(null)
  useEffect(() => {
    if (!dismissedItem) return
    const timeout = window.setTimeout(() => setDismissedItem(null), 10_000)
    return () => window.clearTimeout(timeout)
  }, [dismissedItem])

  const runEditMutation = useCallback(
    async (mutation: Parameters<typeof mutateProfileCuration>[0]) => {
      setEditSaving(true)
      setEditError(null)
      const properties = {
        action: mutation.action,
        section: mutation.section,
        source: 'profile',
      }
      try {
        const result = await mutateProfileCuration(mutation)
        capturePostHogEvent('profile_curation_saved', {
          ...properties,
          ...('isFeatured' in result ? { is_featured: result.isFeatured } : {}),
        })
        return result
      } catch (error) {
        capturePostHogEvent('profile_curation_failed', properties)
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

      setDismissedItem({ section, itemId })

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

  const undoDismissItem = useCallback(async () => {
    if (!dismissedItem) return
    setDismissedItem(null)
    const result = await runEditMutation({
      action: 'restore-item',
      accountId,
      section: dismissedItem.section,
      itemId: dismissedItem.itemId,
    })
    if (!result) {
      setDismissedItem(dismissedItem)
      return
    }

    if (dismissedItem.section === 'bangers') {
      await reloadFeed(activeYear, sort)
      return
    }

    await reloadPeople(activeYear)
  }, [
    accountId,
    activeYear,
    dismissedItem,
    reloadFeed,
    reloadPeople,
    runEditMutation,
    sort,
  ])

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
          ? (getFeed(activeYear, sort)?.tweets ?? [])
          : getPeople(activeYear)
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
      activeYear,
      sort,
      getFeed,
      getPeople,
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
        await reloadFeed(activeYear, sort)
        return
      }

      await reloadPeople(activeYear)
    },
    [accountId, activeYear, reloadFeed, reloadPeople, runEditMutation, sort],
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

      await reloadFeed(null, sort)
      return true
    },
    [accountId, reloadFeed, runEditMutation, sort],
  )

  return {
    editError,
    dismissedItem,
    undoDismissItem,
    dismissItem,
    toggleFeature,
    moveItem,
    restoreSection,
    addTweet,
  }
}
