'use client'

import { useState } from 'react'

export type DigestEmailStatus = 'none' | 'subscribed' | 'unsubscribed'

const STATUS_COPY: Record<DigestEmailStatus, string> = {
  none: 'Not subscribed.',
  subscribed: 'Subscribed.',
  unsubscribed: 'Unsubscribed.',
}

export function DigestEmailSettings({
  initialStatus,
  initialEmail,
}: {
  initialStatus: DigestEmailStatus
  /** Masked, e.g. "ch•••••••@gmail.com". */
  initialEmail: string | null
}) {
  const [status, setStatus] = useState<DigestEmailStatus>(initialStatus)
  const [maskedEmail, setMaskedEmail] = useState(initialEmail)
  const [emailInput, setEmailInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = async (input: RequestInfo, init: RequestInit) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(input, init)
      const body = (await response.json().catch(() => null)) as {
        error?: string
        email?: string
        status?: string
      } | null
      if (!response.ok) {
        setError(body?.error ?? 'Something went wrong. Please try again.')
        return null
      }
      return body
    } catch {
      setError('Something went wrong. Please try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const unsubscribeNow = async () => {
    const body = await request('/api/digest/email/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe' }),
    })
    if (body) setStatus('unsubscribed')
  }

  const subscribeNow = async () => {
    if (!emailInput.trim()) return
    const body = await request('/api/digest/email/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput }),
    })
    if (body) {
      setStatus('subscribed')
      setMaskedEmail(body.email ?? null)
      setEmailInput('')
    }
  }

  const active = status === 'subscribed'

  return (
    <section className="mb-8 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Daily Digest email</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {STATUS_COPY[status]}
        {active && maskedEmail ? ` Sending to ${maskedEmail}.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {active ? (
          <button
            type="button"
            onClick={() => void unsubscribeNow()}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold transition-colors hover:border-zinc-500 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
          >
            {busy ? 'Working…' : 'Unsubscribe'}
          </button>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void subscribeNow()
            }}
          >
            <input
              type="email"
              required
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address for the daily digest"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand dark:border-zinc-700"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-950"
            >
              {busy ? 'Working…' : 'Subscribe'}
            </button>
          </form>
        )}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </section>
  )
}
