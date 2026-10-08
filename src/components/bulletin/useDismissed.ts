'use client'
import { useCallback, useMemo, useRef, useState } from 'react'

const FAILED = 'Could not save that. Try again.'

/**
 * Notices this reader hid as not relevant, saved to their account. Notices
 * hidden on earlier visits never reach the browser; `dismissed` only holds
 * the ones hidden since this page loaded, and `count` covers both.
 */
export function useDismissed(initialCount: number) {
  const [ids, setIds] = useState<string[]>([])
  const [count, setCount] = useState(initialCount)
  const [error, setError] = useState('')
  // One write at a time, so a quick undo cannot overtake its dismissal.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const send = useCallback((method: 'POST' | 'DELETE', id?: string) => {
    const request = queue.current.then(async () => {
      const response = await fetch(
        '/api/bulletin/dismissals' +
          (method === 'DELETE' && id ? `?tweet_id=${id}` : ''),
        method === 'POST'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tweet_id: id }),
            }
          : { method },
      )
      if (!response.ok) throw new Error(FAILED)
    })
    queue.current = request.catch(() => {})
    return request
  }, [])
  const apply = useCallback((id: string, hide: boolean) => {
    setIds((value) => [
      ...value.filter((other) => other !== id),
      ...(hide ? [id] : []),
    ])
    setCount((value) => Math.max(0, value + (hide ? 1 : -1)))
  }, [])
  const change = useCallback(
    (id: string, hide: boolean) => {
      setError('')
      apply(id, hide)
      send(hide ? 'POST' : 'DELETE', id).catch(() => {
        apply(id, !hide)
        setError(FAILED)
      })
    },
    [apply, send],
  )
  const dismiss = useCallback((id: string) => change(id, true), [change])
  const restore = useCallback((id: string) => change(id, false), [change])
  /** Resolves true once every hidden notice is restored; the board must then reload. */
  const restoreAll = useCallback(() => {
    setError('')
    return send('DELETE').then(
      () => true,
      () => {
        setError(FAILED)
        return false
      },
    )
  }, [send])
  const dismissed = useMemo(() => new Set(ids), [ids])
  return {
    dismissed,
    count,
    error,
    clearError: useCallback(() => setError(''), []),
    dismiss,
    restore,
    restoreAll,
  }
}
