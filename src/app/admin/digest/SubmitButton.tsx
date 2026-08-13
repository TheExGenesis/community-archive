'use client'

import { useState, type ReactNode } from 'react'

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const [pending, setPending] = useState(false)
  const colors =
    variant === 'primary'
      ? 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
      : variant === 'danger'
        ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200'
        : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => setPending(true)}
      className={`inline-flex items-center justify-center rounded-md border border-transparent px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${colors}`}
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  )
}
