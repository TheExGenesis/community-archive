'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'

type Phase =
  | 'loading'
  | 'idle'
  | 'open'
  | 'submitting'
  | 'done'
  | 'unsubscribing'
type ManagedSubscription = { id: string; email: string }
type Placement = 'compact' | 'home' | 'digest'

// Unsubscribe redirects land on /digest?email=<status>.
const REDIRECT_MESSAGES: Record<string, string> = {
  unsubscribed: 'Unsubscribed ✓',
  invalid: 'That link is invalid or expired.',
  error: 'Something went wrong. Please try again.',
}

const pillClasses =
  'rounded-full bg-brand px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:text-brand-foreground dark:focus-visible:ring-offset-[#111114]'

function SubscribeControl({ placement }: { placement: Placement }) {
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
  const focusOnOpen = useRef(false)
  const isDigestCta = placement === 'digest'
  const isHome = placement === 'home'
  const startsWithEmailField = isHome || isDigestCta

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
          setPhase(startsWithEmailField ? 'open' : 'idle')
        }
      } catch {
        if (active) setPhase(startsWithEmailField ? 'open' : 'idle')
      }
    })()
    return () => {
      active = false
    }
  }, [startsWithEmailField])

  useEffect(() => {
    if (phase === 'open' && focusOnOpen.current) {
      inputRef.current?.focus()
      focusOnOpen.current = false
    }
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
      setPhase(startsWithEmailField ? 'open' : 'idle')
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
    const control = (
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
    const header =
      isDigestCta && subscription && typeof document !== 'undefined'
        ? document.getElementById('digest-subscribe-header')
        : null
    return header ? createPortal(control, header) : control
  }

  // Wait for the account check before showing a large invitation to subscribers.
  if (isDigestCta && phase === 'loading') return null

  const ctaCopy = isDigestCta ? (
    <div>
      <p className="text-xl font-semibold text-zinc-950 dark:text-white sm:text-2xl">
        Get the daily digest in your inbox
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        The stories worth catching up on, delivered each day.
      </p>
    </div>
  ) : null

  const ctaClasses =
    'mt-9 flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/40 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6'

  if (phase === 'idle' || phase === 'loading') {
    const control = (
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
          onClick={() => {
            focusOnOpen.current = true
            setPhase('open')
          }}
          className={
            isDigestCta
              ? 'rounded-full bg-brand px-7 py-3 text-base font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:text-brand-foreground'
              : pillClasses
          }
        >
          Subscribe
        </button>
      </div>
    )
    return isDigestCta ? (
      <section
        aria-label="Subscribe to the daily digest"
        className={ctaClasses}
      >
        {ctaCopy}
        {control}
      </section>
    ) : (
      control
    )
  }

  const form = (
    <div className={isHome || isDigestCta ? 'w-full sm:w-auto' : 'relative'}>
      <form
        className={`flex items-center gap-1 border border-zinc-300 bg-white pl-3 focus-within:ring-2 focus-within:ring-brand dark:border-zinc-700 dark:bg-zinc-900 ${
          isHome || isDigestCta
            ? 'rounded-xl py-1 pr-1 shadow-sm'
            : 'rounded-full py-0.5 pr-0.5'
        }`}
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
            if (event.key === 'Escape' && !startsWithEmailField)
              setPhase('idle')
          }}
          placeholder="you@example.com"
          aria-label="Email address for the daily digest"
          className={`min-w-0 flex-1 bg-transparent text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 ${
            isHome || isDigestCta
              ? 'w-32 text-sm sm:w-44'
              : 'w-44 text-[13px] sm:w-52'
          }`}
          disabled={phase === 'submitting'}
        />
        <button
          type="submit"
          disabled={phase === 'submitting'}
          className={`${
            isHome || isDigestCta
              ? 'shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-brand-foreground'
              : pillClasses
          } disabled:opacity-60`}
        >
          {phase === 'submitting' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      <span
        className={`${isHome || isDigestCta ? 'mt-1 block' : 'absolute right-0 top-full mt-1 whitespace-nowrap pr-2'} text-[11px] text-zinc-500 dark:text-zinc-400`}
      >
        {error ?? 'Daily digest in your inbox. Unsubscribe anytime.'}
      </span>
    </div>
  )
  return isDigestCta ? (
    <section aria-label="Subscribe to the daily digest" className={ctaClasses}>
      {ctaCopy}
      {form}
    </section>
  ) : (
    form
  )
}

export function DigestSubscribeButton({
  placement = 'compact',
}: {
  placement?: Placement
}) {
  return (
    // useSearchParams needs a Suspense boundary on statically rendered pages.
    <Suspense
      fallback={
        placement === 'digest' ? null : (
          <span className={pillClasses}>Subscribe</span>
        )
      }
    >
      <SubscribeControl placement={placement} />
    </Suspense>
  )
}
