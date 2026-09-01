'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Phase = 'idle' | 'open' | 'submitting' | 'done'

// Confirm/unsubscribe redirects land on /digest?email=<status>.
const REDIRECT_MESSAGES: Record<string, string> = {
  confirmed: 'Subscription confirmed ✓',
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
  const [phase, setPhase] = useState<Phase>('idle')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

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
      setPhase('done')
    } catch {
      setError('Something went wrong. Please try again.')
      setPhase('open')
    }
  }

  if (phase === 'done') {
    return (
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
        Check your inbox ✓
      </span>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="flex items-center gap-2">
        {redirectMessage ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
            {redirectMessage}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setPhase('open')}
          className={pillClasses}
        >
          Subscribe
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
          {phase === 'submitting' ? 'Sending…' : 'Subscribe'}
        </button>
      </form>
      <span className="pr-2 text-[11px] text-zinc-500 dark:text-zinc-400">
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
