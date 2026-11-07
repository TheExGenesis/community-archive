'use client'

import { useEffect } from 'react'
import ErrorFallback from '@/components/ErrorFallback'
import { capturePostHogException } from '@/lib/posthog'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    void capturePostHogException(error, { boundary: 'route' })
  }, [error])

  return <ErrorFallback reset={reset} />
}
