'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useArchiveSearch } from './ArchiveSearchProvider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Search } from 'lucide-react'
import UserSearchInput from '@/components/UserSearchInput'
import { buildSearchHref, parseSearchExpression } from '@/lib/searchParams'
import { capturePostHogEvent } from '@/lib/posthog'

export default function HeaderSearch() {
  const router = useRouter()
  const { query, setQuery } = useArchiveSearch()
  const [open, setOpen] = useState(false)
  const searchHref = buildSearchHref(query)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const { options } = parseSearchExpression(query)
    capturePostHogEvent('archive_search_submitted', {
      has_query: Boolean(query.trim()),
      active_filter_count: Object.keys(options).length,
      surface: 'header',
    })
    setOpen(false)
    router.push(searchHref)
  }

  const input = (
    <div className="relative">
      <UserSearchInput
        placeholder="Search tweets, people, ideas"
        value={query}
        onValueChange={setQuery}
        className="h-9 w-full border-border bg-muted py-1.5 pl-3 pr-9 text-xs focus:ring-brand"
        aria-label="Search Community Archive"
        autoComplete="off"
      />
      <button
        type="submit"
        aria-label="Search archive"
        className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Search Community Archive"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent sm:hidden lg:inline-flex xl:hidden"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] p-2"
        >
          <form onSubmit={handleSubmit}>{input}</form>
        </PopoverContent>
      </Popover>
      <form
        onSubmit={handleSubmit}
        className="hidden w-52 sm:block lg:hidden xl:block 2xl:w-60"
      >
        {input}
      </form>
    </>
  )
}
