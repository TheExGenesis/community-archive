'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTweetBackLink } from '@/lib/navigation'

/**
 * Reads its origin from the query string in the browser so the permalink
 * page can be cached once for every visitor regardless of where they came
 * from. Mount inside a Suspense boundary.
 */
export default function TweetBackLink() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { href, label, hasKnownOrigin } = getTweetBackLink({
    from: searchParams.get('from') ?? undefined,
    returnTo: searchParams.get('returnTo') ?? undefined,
  })

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!hasKnownOrigin || window.history.length <= 1) return
        event.preventDefault()
        router.back()
      }}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}

export function TweetBackLinkFallback() {
  const { href, label } = getTweetBackLink()
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
