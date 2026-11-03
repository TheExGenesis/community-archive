'use client'

import { useEffect, useState } from 'react'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'

/**
 * Carries a shared trends view through login. Read from the browser after
 * mount so the guest preview itself can be cached without its query string;
 * useSearchParams() is empty on this build-time static route once the
 * middleware rewrites /trends to it.
 */
export default function GuestTrendsSignIn() {
  const [query, setQuery] = useState('')
  useEffect(() => setQuery(window.location.search.slice(1)), [])
  return (
    <BrowsingSignInPrompt
      title="Log in to explore trends"
      description="Chart any term across the full archive, compare up to several lines, and read the posts behind each spike."
      returnTo={`/trends${query ? `?${query}` : ''}`}
    />
  )
}
