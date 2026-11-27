'use client'

import { useEffect } from 'react'
import ErrorFallback from '@/components/ErrorFallback'
import { capturePostHogException } from '@/lib/posthog'
import './globals.css'

// Replaces the root layout when it crashes, so it must render <html> and
// <body> itself. The PostHog provider is gone at this point; the capture
// helper falls back to anonymous exception capture.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    void capturePostHogException(error, { boundary: 'global' })
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <ErrorFallback reset={reset} />
      </body>
    </html>
  )
}
