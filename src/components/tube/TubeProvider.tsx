'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  EMPTY_TUBE_STATE,
  TUBE_DATA_URL,
  type TubeData,
  type TubeState,
  type TubeVideo,
} from '@/lib/tube'

const STORAGE_KEY = 'ca-tube:v2'
const LEGACY_KEY = 'ca-tube:v1'

function loadState(): TubeState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...EMPTY_TUBE_STATE, ...JSON.parse(raw) }
    const legacy = window.localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const old = JSON.parse(legacy) as {
        watched?: string[]
        liked?: string[]
        hidden?: string[]
      }
      return {
        ...EMPTY_TUBE_STATE,
        history: (old.watched ?? []).map((id) => ({ id, at: 0 })),
        liked: old.liked ?? [],
        disliked: old.hidden ?? [],
      }
    }
  } catch {
    // Private windows can refuse storage; start fresh.
  }
  return EMPTY_TUBE_STATE
}

function saveState(state: TubeState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Recommendations just reset next visit.
  }
}

function toggle(list: string[], id: string, on: boolean): string[] {
  const rest = list.filter((x) => x !== id)
  return on ? [...rest, id].slice(-500) : rest
}

interface TubeContextValue {
  data: TubeData | null
  error: boolean
  byId: Map<string, TubeVideo>
  state: TubeState
  /** Random per page load so "Best" varies between visits. */
  seed: number
  reshuffle: () => void
  watched: (id: string) => void
  setLiked: (id: string, on: boolean) => void
  setDisliked: (id: string, on: boolean) => void
  setLater: (id: string, on: boolean) => void
  setFrames: (on: boolean) => void
  clearHistory: () => void
  forgetAll: () => void
}

const TubeContext = createContext<TubeContextValue | null>(null)

export function TubeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TubeData | null>(null)
  const [error, setError] = useState(false)
  const [state, setState] = useState<TubeState>(EMPTY_TUBE_STATE)
  const [seed, setSeed] = useState(1)

  useEffect(() => {
    setState(loadState())
    setSeed(Math.floor(Math.random() * 1e9))
    fetch(TUBE_DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  const update = useCallback((fn: (s: TubeState) => TubeState) => {
    setState((s) => {
      const next = fn(s)
      saveState(next)
      return next
    })
  }, [])

  const value = useMemo<TubeContextValue>(
    () => ({
      data,
      error,
      byId: new Map(data?.videos.map((v) => [v.id, v]) ?? []),
      state,
      seed,
      reshuffle: () => setSeed(Math.floor(Math.random() * 1e9)),
      watched: (id) =>
        update((s) => ({
          ...s,
          history: [
            ...s.history.filter((h) => h.id !== id),
            { id, at: Math.floor(Date.now() / 1000) },
          ].slice(-500),
          later: s.later.filter((x) => x !== id),
        })),
      setLiked: (id, on) =>
        update((s) => ({
          ...s,
          liked: toggle(s.liked, id, on),
          disliked: on ? s.disliked.filter((x) => x !== id) : s.disliked,
        })),
      setDisliked: (id, on) =>
        update((s) => ({
          ...s,
          disliked: toggle(s.disliked, id, on),
          liked: on ? s.liked.filter((x) => x !== id) : s.liked,
        })),
      setLater: (id, on) =>
        update((s) => ({ ...s, later: toggle(s.later, id, on) })),
      setFrames: (on) => update((s) => ({ ...s, frames: on })),
      clearHistory: () => update((s) => ({ ...s, history: [] })),
      forgetAll: () => update((s) => ({ ...EMPTY_TUBE_STATE, frames: s.frames })),
    }),
    [data, error, state, seed, update],
  )

  return <TubeContext.Provider value={value}>{children}</TubeContext.Provider>
}

export function useTube(): TubeContextValue {
  const ctx = useContext(TubeContext)
  if (!ctx) throw new Error('useTube must be used inside TubeProvider')
  return ctx
}
