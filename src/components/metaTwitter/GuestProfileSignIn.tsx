'use client'

import { useSearchParams } from 'next/navigation'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'

/**
 * Carries a requested chapter and section through login. Read in the browser
 * so the guest preview itself can be cached without its query string.
 * Mount inside a Suspense boundary.
 */
export default function GuestProfileSignIn({
  basePath,
  username,
}: {
  basePath: string
  username: string
}) {
  const searchParams = useSearchParams()
  const returnParams = new URLSearchParams()
  const chapter = searchParams.get('chapter')
  const section = searchParams.get('section')
  if (chapter && /^\d{4}$/.test(chapter)) {
    returnParams.set('chapter', chapter)
    if (section && /^[a-z0-9-]{1,64}$/.test(section)) {
      returnParams.set('section', section)
    }
  }
  const query = returnParams.toString()
  return (
    <BrowsingSignInPrompt
      title="Log in to explore this profile"
      description={`See @${username}’s archived posts and conversations on Community Archive. Log in to view the full profile.`}
      returnTo={`${basePath}${query ? `?${query}` : ''}`}
    />
  )
}
