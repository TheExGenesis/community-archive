'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BulletinRelationships } from '@/lib/bulletin/board'

/** Archived follow badges are optional decoration, loaded after the cards. */
export function useFollowBadges(
  graph: BulletinRelationships,
  enabled: boolean,
) {
  const [follows, setFollows] = useState<{
    following: string[]
    followers: string[]
  }>()
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/bulletin/follows', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        const ids = (value: unknown): value is string[] =>
          Array.isArray(value) &&
          value.every((id) => typeof id === 'string' && /^\d{1,20}$/.test(id))
        if (
          !controller.signal.aborted &&
          ids(data.following) &&
          ids(data.followers)
        )
          setFollows({ following: data.following, followers: data.followers })
      })
      .catch(() => {
        /* A missing badge must not interrupt the board. */
      })
    return () => controller.abort()
  }, [enabled])
  return useMemo(() => ({ ...graph, ...follows }), [graph, follows])
}
