'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import UserSearchInput from '@/components/UserSearchInput'
import { buildSearchHref, parseSearchExpression } from '@/lib/searchParams'
import { capturePostHogEvent } from '@/lib/posthog'

export default function HeaderSearch() {
  const router = useRouter()
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
    <form onSubmit={handleSubmit} className="hidden items-center sm:flex">
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
  )
}
