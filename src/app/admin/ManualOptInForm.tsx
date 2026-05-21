'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRef, useState, useTransition } from 'react'
import { manualOptIn } from './actions'

// Client-side wrapper around the manualOptIn server action so submit feedback
// renders inline (no full redirect/RSC dance). The original redirect-based
// version made it ambiguous whether anything had happened; this version shows
// success/error directly.
export function ManualOptInForm() {
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error'
    text: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className="grid gap-3 sm:grid-cols-[1fr_auto]"
      action={(formData) => {
        startTransition(async () => {
          setMessage(null)
          const result = await manualOptIn(formData)
          if (result.ok) {
            setMessage({ tone: 'ok', text: result.message })
            formRef.current?.reset()
          } else {
            setMessage({ tone: 'error', text: result.error })
          }
        })
      }}
    >
      <Input name="username" placeholder="username" required />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Opting in…' : 'Opt in'}
      </Button>
      {message ? (
        <p
          className={
            message.tone === 'ok'
              ? 'sm:col-span-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
              : 'sm:col-span-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100'
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  )
}
