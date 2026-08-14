'use client'

import { useState } from 'react'

export function DigestGenerationDayButton({
  date,
  day,
}: {
  date: string
  day: number
}) {
  const [pending, setPending] = useState(false)

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => setPending(true)}
      aria-label={
        pending
          ? `Generating digest for ${date}`
          : `Generate digest for ${date}`
      }
      className="dark:bg-blue-950/35 flex aspect-square w-full items-center justify-center rounded-[6px] border border-blue-200 bg-blue-50 text-[12.5px] font-semibold text-brand transition-colors hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60 dark:border-blue-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/60"
    >
      {pending ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-brand"
          aria-hidden="true"
        />
      ) : (
        day
      )}
    </button>
  )
}
