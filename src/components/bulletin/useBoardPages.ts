'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_BULLETIN_FILTERS,
  type BulletinFilters,
  type BulletinPage,
} from '@/lib/bulletin/types'

function filterKey(filters: BulletinFilters) {
  return JSON.stringify([
    filters.kind,
    filters.side,
    filters.search.trim(),
    filters.past,
    filters.recommended,
    filters.ascending,
  ])
}
function query(filters: BulletinFilters) {
  return new URLSearchParams({
    kind: filters.kind,
    side: filters.side,
    q: filters.search.trim(),
    past: filters.past ? '1' : '0',
    sort: filters.recommended ? 'recommended' : 'newest',
    dir: filters.ascending ? 'asc' : 'desc',
  })
}
async function fetchPage(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<BulletinPage> {
  const response = await fetch(`/api/bulletin/board?${params}`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'The board changed. Refresh to continue.'
        : 'Could not load notices. Please retry.',
    )
  return response.json()
}

export function useBoardPages(
  initial: BulletinPage | undefined,
  filters: BulletinFilters,
  ready: boolean,
) {
  const key = filterKey(filters)
  const [state, setState] = useState({
    key: filterKey(DEFAULT_BULLETIN_FILTERS),
    page: initial,
  })
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [laneErrors, setLaneErrors] = useState<Record<string, string>>({})
  const requests = useRef(new Map<string, AbortController>())
  const currentKey = useRef(key)
  currentKey.current = key
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const pending = !!initial && state.key !== key

  useEffect(() => {
    if (!initial || !ready) return
    const controllers = requests.current
    setLoading({})
    setLaneErrors({})
    setError('')
    const controller = new AbortController()
    // Debounce searches, while preserving the server-rendered default page.
    const timer = pending
      ? setTimeout(() => {
          fetchPage(query(filtersRef.current), controller.signal)
            .then((page) => {
              if (!controller.signal.aborted && currentKey.current === key)
                setState({ key, page })
            })
            .catch(() => {
              if (!controller.signal.aborted)
                setError('Could not load notices. Please retry.')
            })
        }, 200)
      : undefined
    return () => {
      clearTimeout(timer)
      controller.abort()
      controllers.forEach((request) => request.abort())
      controllers.clear()
    }
  }, [key, ready, initial, retry, pending])

  const loadMore = useCallback(
    async (kind: string) => {
      const cursor = state.page?.cursors[kind]
      if (!initial || pending || !cursor || requests.current.has(kind)) return
      const controller = new AbortController()
      requests.current.set(kind, controller)
      setLoading((value) => ({ ...value, [kind]: true }))
      setLaneErrors((value) => ({ ...value, [kind]: '' }))
      const params = query({ ...filtersRef.current, kind })
      params.set('after', cursor)
      try {
        const page = await fetchPage(params, controller.signal)
        if (controller.signal.aborted || currentKey.current !== key) return
        setState((value) => {
          if (value.key !== key || !value.page) return value
          const merged = new Map(value.page.notices.map((o) => [o.tweet_id, o]))
          for (const notice of page.notices) merged.set(notice.tweet_id, notice)
          return {
            key,
            page: {
              ...value.page,
              notices: Array.from(merged.values()),
              counts: { ...value.page.counts, ...page.counts },
              cursors: { ...value.page.cursors, ...page.cursors },
            },
          }
        })
      } catch (cause) {
        if (!controller.signal.aborted)
          setLaneErrors((value) => ({
            ...value,
            [kind]:
              cause instanceof Error
                ? cause.message
                : 'Could not load notices.',
          }))
      } finally {
        if (requests.current.get(kind) === controller) {
          requests.current.delete(kind)
          setLoading((value) => ({ ...value, [kind]: false }))
        }
      }
    },
    [initial, pending, state.page, key],
  )
  return {
    page: state.page,
    pending,
    error,
    loading,
    laneErrors,
    loadMore,
    retry: () => setRetry((n) => n + 1),
  }
}
