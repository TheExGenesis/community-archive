'use client'

import type { ReactNode } from 'react'
// Next.js 14 supplies React DOM's canary form hook at runtime.
// @ts-expect-error The installed stable React DOM types do not expose it yet.
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  name,
  value,
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'danger'
  name?: string
  value?: string
}) {
  const { data, pending: formPending } = useFormStatus()
  const pending =
    formPending && (name && value ? data?.get(name) === value : true)
  const colors =
    variant === 'primary'
      ? 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
      : variant === 'danger'
        ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200'
        : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={formPending}
      className={`inline-flex items-center justify-center rounded-md border border-transparent px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${colors}`}
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  )
}
