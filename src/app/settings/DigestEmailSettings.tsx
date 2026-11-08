'use client'

import { useState } from 'react'

export type DigestEmailStatus = 'none' | 'subscribed' | 'unsubscribed'
type List = 'daily' | 'weekly'

const LISTS: { list: List; name: string; description: string }[] = [
  {
    list: 'daily',
    name: 'Daily Digest',
    description: "Yesterday's stories, every morning.",
  },
  {
    list: 'weekly',
    name: 'Week in Review',
    description: "The week's top stories, every Monday.",
  },
]

type SettingsBody = {
  error?: string
  email?: string
  status?: DigestEmailStatus
  daily?: boolean
  weekly?: boolean
}

/** Email lists for the signed-in account: one address, a switch per list. */
export function DigestEmailSettings({
  initialStatus,
  initialEmail,
  initialDaily = initialStatus === 'subscribed',
  initialWeekly = false,
}: {
  initialStatus: DigestEmailStatus
  /** Masked, e.g. "ch•••••••@gmail.com". */
  initialEmail: string | null
  initialDaily?: boolean
  initialWeekly?: boolean
}) {
  const [status, setStatus] = useState<DigestEmailStatus>(initialStatus)
  const [maskedEmail, setMaskedEmail] = useState(initialEmail)
  const [enabled, setEnabled] = useState<Record<List, boolean>>({
    daily: initialDaily,
    weekly: initialWeekly,
  })
  const [emailInput, setEmailInput] = useState('')
  const [busy, setBusy] = useState<List | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const request = async (
    key: List | 'all',
    input: RequestInfo,
    init: RequestInit,
  ) => {
    setBusy(key)
    setError(null)
    try {
      const response = await fetch(input, init)
      const body = (await response
        .json()
        .catch(() => null)) as SettingsBody | null
      if (!response.ok) {
        setError(body?.error ?? 'Something went wrong. Please try again.')
        return null
      }
      return body
    } catch {
      setError('Something went wrong. Please try again.')
      return null
    } finally {
      setBusy(null)
    }
  }

  const apply = (body: SettingsBody) => {
    if (body.status) setStatus(body.status)
    if (body.email) setMaskedEmail(body.email)
    setEnabled({ daily: body.daily === true, weekly: body.weekly === true })
  }

  const hasAddress = status !== 'none' && maskedEmail

  const toggle = async (list: List) => {
    const body = await request(list, '/api/digest/email/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', list, enabled: !enabled[list] }),
    })
    if (body) apply(body)
  }

  const subscribeNow = async () => {
    if (!emailInput.trim()) return
    const lists = LISTS.filter(({ list }) => enabled[list]).map((l) => l.list)
    const first = lists[0] ?? 'daily'
    const body = await request('all', '/api/digest/email/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput, list: first }),
    })
    if (!body) return
    setStatus('subscribed')
    setMaskedEmail(body.email ?? null)
    setEmailInput('')
    setEnabled({ daily: first === 'daily', weekly: first === 'weekly' })
    // A second chosen list is switched on for the new subscription.
    for (const list of lists.slice(1)) {
      const next = await request(list, '/api/digest/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', list, enabled: true }),
      })
      if (next) apply(next)
    }
  }

  const unsubscribeAll = async () => {
    const body = await request('all', '/api/digest/email/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe' }),
    })
    if (body) {
      setStatus('unsubscribed')
      setEnabled({ daily: false, weekly: false })
    }
  }

  const anyOn = enabled.daily || enabled.weekly

  return (
    <section className="mb-8 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Digest emails</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasAddress
          ? anyOn
            ? `Sending to ${maskedEmail}.`
            : `Not sending to ${maskedEmail}.`
          : 'Choose the emails you want, then add your address.'}
      </p>

      <ul className="mt-4 divide-y rounded-md border">
        {LISTS.map(({ list, name, description }) => (
          <li
            key={list}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div>
              <div className="text-sm font-semibold">{name}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled[list]}
              aria-label={`${name} emails`}
              disabled={busy !== null}
              onClick={() =>
                hasAddress
                  ? void toggle(list)
                  : setEnabled((current) => ({
                      ...current,
                      [list]: !current[list],
                    }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 ${
                enabled[list] ? 'bg-brand' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  enabled[list] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {hasAddress ? (
          anyOn ? (
            <button
              type="button"
              onClick={() => void unsubscribeAll()}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold transition-colors hover:border-zinc-500 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
            >
              {busy === 'all' ? 'Working…' : 'Unsubscribe from all'}
            </button>
          ) : null
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
              aria-label="Email address for digest emails"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand dark:border-zinc-700"
              disabled={busy !== null}
            />
            <button
              type="submit"
              disabled={busy !== null || !anyOn}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-950"
            >
              {busy === 'all' ? 'Working…' : 'Subscribe'}
            </button>
          </form>
        )}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </section>
  )
}
