'use client'

import { useSearchParams } from 'next/navigation'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'

/**
 * Carries a shared trends view through login. Read in the browser so the
 * guest preview itself can be cached without its query string. Mount inside
 * a Suspense boundary.
 */
export default function GuestTrendsSignIn() {
  const query = useSearchParams().toString()
  return (
    <BrowsingSignInPrompt
      title="Log in to explore trends"
      description="Chart any term across the full archive, compare up to several lines, and read the posts behind each spike."
      returnTo={`/trends${query ? `?${query}` : ''}`}
    />
  )
}
