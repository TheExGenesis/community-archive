'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-card dark:bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-8 text-center">
        <h2 className="mb-4 text-3xl font-bold text-foreground">
          Something went wrong!
        </h2>
        <p className="mb-6 text-muted-foreground">
          An error occurred while loading this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white transition-colors hover:bg-brand/90 dark:bg-brand dark:text-brand-foreground dark:hover:bg-brand/90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
