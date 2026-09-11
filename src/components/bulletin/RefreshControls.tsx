'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getRefreshState,
  requestRefresh,
} from '@/app/admin/bulletin/refreshActions'
import { formatTimestamp } from '@/lib/bulletin/types'
import type { RefreshState } from '@/lib/bulletin/refresh'

export function RefreshControls({
  promptId,
  dirty = false,
}: {
  promptId: string
  dirty?: boolean
}) {
  const [state, setState] = useState<RefreshState | null>(null)
  const [selection, setSelection] = useState('latest')
  const [budget, setBudget] = useState('0.10')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const requestId = useRef<string>()
  const active = state?.requests.some(
    (r) => r.status === 'queued' || r.status === 'running',
  )

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const next = await getRefreshState()
        if (!cancelled) setState(next)
      } catch {
        if (!cancelled) setMessage('Refresh status could not be loaded.')
      }
    }
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    requestId.current ??= crypto.randomUUID()
    const form = new FormData()
    form.set('selection', selection)
    form.set('budget', budget)
    form.set('prompt_id', promptId)
    form.set('request_id', requestId.current)
    try {
      const result = await requestRefresh(form)
      if (result.error) setMessage(result.error)
      else {
        requestId.current = undefined
        setMessage(
          'Refresh queued. The board updates as new decisions finish; reload it to see changes.',
        )
        setState(await getRefreshState())
      }
    } catch {
      setMessage(
        'Could not confirm the request. Retry to check the same request without duplicating it.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-sm">
      <div>
        <h3 className="font-semibold">Refresh bulletin notices</h3>
        <p className="mt-1 text-muted-foreground">
          Reclassify all candidates in the selected window with saved prompt
          version {promptId}. Successful decisions can update or remove notices.
          Failed checks keep the previous notice.
        </p>
      </div>
      {dirty && (
        <p role="status">Save your prompt changes before starting a refresh.</p>
      )}
      {state && !state.enabled && (
        <p>Refreshes are not enabled here. Local preview is read-only.</p>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          Window
          <select
            value={selection}
            onChange={(e) => {
              setSelection(e.target.value)
              requestId.current = undefined
            }}
            disabled={busy || active}
            className="rounded-md border bg-background p-2"
          >
            <option value="latest">Latest run’s window</option>
            <option value="two_weeks">Last 14 complete UTC days</option>
          </select>
        </label>
        <label className="grid gap-1">
          Maximum spend (USD)
          <input
            type="number"
            min="0.01"
            max="1"
            step="0.01"
            required
            value={budget}
            onChange={(e) => {
              setBudget(e.target.value)
              requestId.current = undefined
            }}
            disabled={busy || active}
            className="w-32 rounded-md border bg-background p-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy || active || dirty || !state?.enabled || !!state.error}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy
            ? 'Queueing…'
            : active
              ? 'Refresh in progress'
              : 'Queue refresh'}
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        Starts within about a minute when the worker is free. Larger windows
        continue in batches. The cap covers the whole request, including
        retries; the $1 monthly limit also applies. A budget or model failure
        can stop a refresh before the full window finishes.
      </p>
      <p role="status">{message || state?.error}</p>
      {state?.requests.length ? (
        <ul className="space-y-3" aria-label="Recent refresh requests">
          {state.requests.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <p className="font-medium">
                {r.status === 'complete'
                  ? 'Complete'
                  : r.status === 'stopped'
                    ? 'Stopped before completion'
                    : r.status === 'running'
                      ? 'Running'
                      : 'Queued'}{' '}
                · Prompt {r.prompt_id}
              </p>
              <p>
                {formatTimestamp(r.window_start)} →{' '}
                {formatTimestamp(r.window_end)} (end exclusive)
              </p>
              <p>
                ${Number(r.spent_usd).toFixed(4)} charged or reserved / $
                {Number(r.budget_usd).toFixed(2)} cap
              </p>
              {r.counts && (
                <p>
                  Latest batch: {r.counts.rows_seen ?? 0} tweets scanned ·{' '}
                  {r.counts.pending ?? '—'} candidates remaining
                </p>
              )}
              {r.status === 'stopped' && (
                <p>
                  Reason: {r.last_status?.replaceAll('_', ' ')}. Check run
                  history before requesting another refresh.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
