'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { TweetLikeSummary, TweetLikeSummaryResponse } from './types'

// Mirrors MAX_SUMMARY_TWEET_IDS and TWEET_ID_PATTERN on the server.
const BATCH_SIZE = 100
const BATCH_DELAY_MS = 30
const TWEET_ID_PATTERN = /^[1-9]\d{0,19}$/

export interface TweetLikeState extends TweetLikeSummary {
  /** False until the server's state has loaded; the tweet can't be liked yet. */
  ready: boolean
  /** Bumped whenever the server confirms a state, never on optimistic updates. */
  revision: number
}

const INITIAL: TweetLikeState = {
  count: 0,
  liked: false,
  ready: false,
  revision: 0,
}

// One shared store, so a tweet list hydrates every like button from a single
// batched request and the same tweet stays in sync wherever it is rendered.
const states = new Map<string, TweetLikeState>()
const listeners = new Map<string, Set<() => void>>()
const queued = new Set<string>()
const requested = new Set<string>()
const inFlight = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

const getState = (tweetId: string) => states.get(tweetId) ?? INITIAL

const setState = (tweetId: string, state: TweetLikeState) => {
  states.set(tweetId, state)
  listeners.get(tweetId)?.forEach((listener) => listener())
}

const confirm = (tweetId: string, summary: TweetLikeSummary) =>
  setState(tweetId, {
    ...summary,
    ready: true,
    revision: getState(tweetId).revision + 1,
  })

async function flush() {
  flushTimer = null
  const ids = Array.from(queued)
  queued.clear()
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = ids.slice(start, start + BATCH_SIZE)
    try {
      const response = await fetch(`/api/tweets/likes?ids=${batch.join(',')}`)
      if (!response.ok) {
        throw new Error(`Like lookup failed: ${response.status}`)
      }
      const data = (await response.json()) as TweetLikeSummaryResponse
      batch.forEach((id) =>
        confirm(id, data.likes[id] ?? { count: 0, liked: false }),
      )
    } catch {
      // The buttons stay disabled; the next mount of these tweets retries.
      batch.forEach((id) => requested.delete(id))
    }
  }
}

function subscribe(tweetId: string, listener: () => void) {
  const tweetListeners = listeners.get(tweetId) ?? new Set()
  listeners.set(tweetId, tweetListeners)
  tweetListeners.add(listener)

  // Preview fixtures use non-numeric ids; one would fail the whole batch.
  if (!requested.has(tweetId) && TWEET_ID_PATTERN.test(tweetId)) {
    requested.add(tweetId)
    queued.add(tweetId)
    flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS)
  }

  return () => {
    tweetListeners.delete(listener)
    if (tweetListeners.size === 0) listeners.delete(tweetId)
  }
}

export function useTweetLike(tweetId: string): TweetLikeState {
  // A stable subscribe keeps re-renders from re-subscribing (and re-queueing).
  const subscribeToTweet = useCallback(
    (listener: () => void) => subscribe(tweetId, listener),
    [tweetId],
  )
  return useSyncExternalStore(
    subscribeToTweet,
    () => getState(tweetId),
    () => INITIAL,
  )
}

export type ToggleTweetLikeResult =
  | 'liked'
  | 'unliked'
  | 'signed_out'
  | 'busy'
  | 'error'

/**
 * Optimistically flips the viewer's like, reverting if the write fails. One
 * write per tweet at a time, wherever on the page the click came from.
 */
export async function toggleTweetLike(
  tweetId: string,
): Promise<ToggleTweetLikeResult> {
  const previous = getState(tweetId)
  if (!previous.ready || inFlight.has(tweetId)) return 'busy'

  const liked = !previous.liked
  const optimistic = {
    liked,
    count: Math.max(0, previous.count + (liked ? 1 : -1)),
  }
  inFlight.add(tweetId)
  setState(tweetId, { ...previous, ...optimistic })

  try {
    const response = await fetch(`/api/tweets/${tweetId}/like`, {
      method: liked ? 'POST' : 'DELETE',
    })
    if (response.status === 401) {
      setState(tweetId, previous)
      return 'signed_out'
    }
    if (!response.ok) throw new Error(`Like failed: ${response.status}`)
    const data = (await response.json()) as {
      liked: boolean
      count: number | null
    }
    confirm(tweetId, {
      liked: data.liked,
      count: data.count ?? optimistic.count,
    })
    return liked ? 'liked' : 'unliked'
  } catch (error) {
    console.error(error)
    setState(tweetId, previous)
    return 'error'
  } finally {
    inFlight.delete(tweetId)
  }
}

export function resetTweetLikesForTests() {
  states.clear()
  listeners.clear()
  queued.clear()
  requested.clear()
  inFlight.clear()
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
}
