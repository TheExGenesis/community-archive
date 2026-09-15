'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Phase =
  | 'loading'
  | 'idle'
  | 'open'
  | 'submitting'
  | 'done'
  | 'unsubscribing'
type ManagedSubscription = { id: string; email: string }

// Unsubscribe redirects land on /digest?email=<status>.
const REDIRECT_MESSAGES: Record<string, string> = {
  unsubscribed: 'Unsubscribed ✓',
  invalid: 'That link is invalid or expired.',
  error: 'Something went wrong. Please try again.',
}

const pillClasses =
  'rounded-full bg-brand px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:text-brand-foreground dark:focus-visible:ring-offset-[#111114]'

function SubscribeControl() {
  // Nullable outside the app router (e.g. bare jsdom renders).
  const searchParams = useSearchParams()
  const redirectMessage = REDIRECT_MESSAGES[searchParams?.get('email') ?? '']
  const [phase, setPhase] = useState<Phase>('loading')
  const [subscription, setSubscription] = useState<ManagedSubscription | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Viewer state must come from the session, not shared digest page caches.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch('/api/digest/email/settings', {
          cache: 'no-store',
        })
        const body = response.ok ? await response.json() : null
        if (!active) return
        if (
          body?.status === 'subscribed' &&
          typeof body.id === 'string' &&
          typeof body.email === 'string'
        ) {
          setSubscription({ id: body.id, email: body.email })
          setPhase('done')
        } else {
          setPhase('idle')
        }
      } catch {
        if (active) setPhase('idle')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (phase === 'open') inputRef.current?.focus()
  }, [phase])

  const submit = async () => {
    if (!email.trim()) return
    setPhase('submitting')
    setError(null)
    try {
      const response = await fetch('/api/digest/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        setError(body?.error ?? 'Something went wrong. Please try again.')
        setPhase('open')
        return
      }
      const body = await response.json()
      setSubscription(
        typeof body.subscriptionId === 'string' &&
          typeof body.email === 'string'
          ? { id: body.subscriptionId, email: body.email }
          : null,
      )
      setMessage(null)
      setPhase('done')
    } catch {
      setError('Something went wrong. Please try again.')
      setPhase('open')
    }
  }

  const unsubscribeNow = async () => {
    if (!subscription || phase === 'unsubscribing') return
    if (
      !window.confirm(
        `Are you sure you want to unsubscribe ${subscription.email} from the Daily Digest?`,
      )
    )
      return
    setPhase('unsubscribing')
    setError(null)
    try {
      const response = await fetch('/api/digest/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unsubscribe',
          subscriptionId: subscription.id,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.status !== 'unsubscribed') {
        throw new Error(
          response.status === 401
            ? 'Please sign in again to unsubscribe.'
            : (body?.error ?? 'Could not unsubscribe. Please try again.'),
        )
      }
      setSubscription(null)
      setPhase('idle')
      setMessage('Unsubscribed ✓')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not unsubscribe. Please try again.',
      )
      setPhase('done')
    }
  }

  if (phase === 'done' || phase === 'unsubscribing') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {subscription ? (
          <button
            type="button"
            className={pillClasses}
            title={`Unsubscribe ${subscription.email}`}
            onClick={() => void unsubscribeNow()}
            disabled={phase === 'unsubscribing'}
          >
            {phase === 'unsubscribing' ? 'Unsubscribing…' : 'Subscribed'}
          </button>
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
            Subscribed ✓
          </span>
        )}
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  if (phase === 'idle' || phase === 'loading') {
    return (
      <div className="flex items-center gap-2">
        {message || redirectMessage ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
            {message ?? redirectMessage}
          </span>
        ) : null}
        <button
          type="button"
          disabled={phase === 'loading'}
          aria-busy={phase === 'loading'}
          onClick={() => setPhase('open')}
          className={pillClasses}
        >
          Subscribe
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <form
        className="flex items-center gap-1 rounded-full border border-zinc-300 bg-white py-0.5 pl-3 pr-0.5 focus-within:ring-2 focus-within:ring-brand dark:border-zinc-700 dark:bg-zinc-900"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          ref={inputRef}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPhase('idle')
          }}
          placeholder="you@example.com"
          aria-label="Email address for the daily digest"
          className="w-44 bg-transparent text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 sm:w-52"
          disabled={phase === 'submitting'}
        />
        <button
          type="submit"
          disabled={phase === 'submitting'}
          className={`${pillClasses} disabled:opacity-60`}
        >
          {phase === 'submitting' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      <span className="absolute right-0 top-full mt-1 whitespace-nowrap pr-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        {error ?? 'Daily digest in your inbox. Unsubscribe anytime.'}
      </span>
    </div>
  )
}

export function DigestSubscribeButton() {
  return (
    // useSearchParams needs a Suspense boundary on statically rendered pages.
    <Suspense fallback={<span className={pillClasses}>Subscribe</span>}>
      <SubscribeControl />
    </Suspense>
  )
}
