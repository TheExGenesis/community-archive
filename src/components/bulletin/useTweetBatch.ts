'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { PortalTweet } from '@/lib/portal/types'

const BATCH_SIZE = 8

type Pending = {
  resolve: (tweet: PortalTweet) => void
  reject: (reason: Error) => void
}

/** Coalesce nearby cards; retain results only for this mounted board. */
export function useTweetBatch() {
  const promises = useRef(new Map<string, Promise<PortalTweet>>())
  const pending = useRef(new Map<string, Pending>())
  const queued = useRef(new Set<string>())
  const controllers = useRef(new Set<AbortController>())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      timer.current = undefined
      for (const controller of Array.from(controllers.current))
        controller.abort()
      for (const item of Array.from(pending.current.values()))
        item.reject(new Error('Cancelled'))
      pending.current.clear()
      queued.current.clear()
      promises.current.clear()
    },
    [],
  )

  return useCallback((id: string): Promise<PortalTweet> => {
    const existing = promises.current.get(id)
    if (existing) return existing
    const promise = new Promise<PortalTweet>((resolve, reject) => {
      pending.current.set(id, { resolve, reject })
      queued.current.add(id)
    })
    promises.current.set(id, promise)
    if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = undefined
        const ids = Array.from(queued.current)
        queued.current.clear()
        for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
          const batch = ids.slice(offset, offset + BATCH_SIZE)
          const controller = new AbortController()
          controllers.current.add(controller)
          fetch(`/api/bulletin/tweets?ids=${batch.join(',')}`, {
            cache: 'no-store',
            signal: controller.signal,
          })
            .then(async (response) => {
              if (controller.signal.aborted) return
              if (!response.ok) throw new Error('Tweets unavailable')
              const data = (await response.json()) as { tweets: PortalTweet[] }
              const tweets = new Map(
                data.tweets.map((tweet) => [tweet.id, tweet]),
              )
              for (const id of batch) {
                const tweet = tweets.get(id)
                if (tweet) pending.current.get(id)?.resolve(tweet)
                else {
                  promises.current.delete(id)
                  pending.current
                    .get(id)
                    ?.reject(new Error('Tweet unavailable'))
                }
                pending.current.delete(id)
              }
            })
            .catch(() => {
              if (controller.signal.aborted) return
              for (const id of batch) {
                promises.current.delete(id)
                pending.current.get(id)?.reject(new Error('Tweets unavailable'))
                pending.current.delete(id)
              }
            })
            .finally(() => controllers.current.delete(controller))
        }
      }, 20)
    }
    return promise
  }, [])
}
