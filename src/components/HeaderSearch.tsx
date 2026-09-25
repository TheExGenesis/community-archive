'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import UserSearchInput from '@/components/UserSearchInput'
import { buildSearchHref, parseSearchExpression } from '@/lib/searchParams'
import { capturePostHogEvent } from '@/lib/posthog'
import { useNavigationAudience } from '@/components/NavigationAudience'
import { cn } from '@/utils/tailwind'

export default function HeaderSearch() {
  const router = useRouter()
  // The member nav is short enough to keep the full input at every desktop
  // width; the visitor nav collapses it to an icon between lg and 2xl.
  const { isMember } = useNavigationAudience()
  const [query, setQuery] = useState('')
  const searchHref = buildSearchHref(query)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const { options } = parseSearchExpression(query)
    capturePostHogEvent('archive_search_submitted', {
      has_query: Boolean(query.trim()),
      active_filter_count: Object.keys(options).length,
      surface: 'header',
    })
    router.push(searchHref)
  }

  return (
    <>
      <Link
        href="/search"
        aria-label="Search Community Archive"
        className={cn(
          'hidden h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent',
          !isMember && 'lg:inline-flex 2xl:hidden',
        )}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </Link>
      <form
        onSubmit={handleSubmit}
        className={cn(
          'hidden items-center sm:flex',
          !isMember && 'lg:hidden 2xl:flex',
        )}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <UserSearchInput
            placeholder="Search tweets..."
            value={query}
            onValueChange={setQuery}
            className="h-9 w-40 border-border bg-muted py-1.5 pl-8 pr-3 text-sm focus:ring-brand lg:w-56"
            aria-label="Search Community Archive"
            autoComplete="off"
          />
        </div>
      </form>
    </>
  )
}
