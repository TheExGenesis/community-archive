'use client'

import { useSyncExternalStore } from 'react'
import type { TweetLikeSummary, TweetLikeSummaryResponse } from './types'

// Mirrors MAX_SUMMARY_TWEET_IDS on the server.
const BATCH_SIZE = 100
const BATCH_DELAY_MS = 30
const NOT_LIKED: TweetLikeSummary = { count: 0, liked: false }

// One shared store, so a tweet list hydrates every like button from a single
// batched request and the same tweet stays in sync wherever it is rendered.
const summaries = new Map<string, TweetLikeSummary>()
const listeners = new Map<string, Set<() => void>>()
const queued = new Set<string>()
const requested = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

const notify = (tweetId: string) =>
  listeners.get(tweetId)?.forEach((listener) => listener())

const setSummary = (tweetId: string, summary: TweetLikeSummary) => {
  summaries.set(tweetId, summary)
  notify(tweetId)
}

async function flush() {
  flushTimer = null
  const ids = Array.from(queued)
  queued.clear()
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = ids.slice(start, start + BATCH_SIZE)
    try {
      const response = await fetch(`/api/tweets/likes?ids=${batch.join(',')}`)
      if (!response.ok)
        throw new Error(`Like lookup failed: ${response.status}`)
      const data = (await response.json()) as TweetLikeSummaryResponse
      batch.forEach((id) => setSummary(id, data.likes[id] ?? NOT_LIKED))
    } catch {
      // Leave the buttons at zero; the next mount of these tweets retries.
      batch.forEach((id) => requested.delete(id))
    }
  }
}

function subscribe(tweetId: string, listener: () => void) {
  const tweetListeners = listeners.get(tweetId) ?? new Set()
  listeners.set(tweetId, tweetListeners)
  tweetListeners.add(listener)

  // Preview fixtures use non-numeric ids; one would fail the whole batch.
  if (!requested.has(tweetId) && /^\d{1,20}$/.test(tweetId)) {
    requested.add(tweetId)
    queued.add(tweetId)
    flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS)
  }

  return () => {
    tweetListeners.delete(listener)
    if (tweetListeners.size === 0) listeners.delete(tweetId)
  }
}

export function useTweetLike(tweetId: string): TweetLikeSummary {
  return useSyncExternalStore(
    (listener) => subscribe(tweetId, listener),
    () => summaries.get(tweetId) ?? NOT_LIKED,
    () => NOT_LIKED,
  )
}

export type ToggleTweetLikeResult = 'liked' | 'unliked' | 'signed_out' | 'error'

/** Optimistically flips the viewer's like, reverting if the write fails. */
export async function toggleTweetLike(
  tweetId: string,
): Promise<ToggleTweetLikeResult> {
  const previous = summaries.get(tweetId) ?? NOT_LIKED
  const liked = !previous.liked
  setSummary(tweetId, {
    liked,
    count: Math.max(0, previous.count + (liked ? 1 : -1)),
  })

  try {
    const response = await fetch(`/api/tweets/${tweetId}/like`, {
      method: liked ? 'POST' : 'DELETE',
    })
    if (response.status === 401 || response.status === 403) {
      setSummary(tweetId, previous)
      return 'signed_out'
    }
    if (!response.ok) throw new Error(`Like failed: ${response.status}`)
    setSummary(tweetId, (await response.json()) as TweetLikeSummary)
    return liked ? 'liked' : 'unliked'
  } catch (error) {
    console.error(error)
    setSummary(tweetId, previous)
    return 'error'
  }
}

export function resetTweetLikesForTests() {
  summaries.clear()
  listeners.clear()
  queued.clear()
  requested.clear()
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
}
