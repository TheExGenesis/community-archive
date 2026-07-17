'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ListFilter, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import UserSearchInput from '@/components/UserSearchInput'
import { buildSearchHref } from '@/lib/searchParams'

export default function HeaderSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const searchHref = buildSearchHref(query)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(searchHref)
  }

  return (
    <form onSubmit={handleSubmit} className="hidden items-center sm:flex">
      <div className="flex items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <UserSearchInput
            placeholder="Search tweets..."
            value={query}
            onValueChange={setQuery}
            className="h-9 w-40 rounded-r-none border-border bg-muted py-1.5 pl-8 pr-3 text-sm focus:ring-brand lg:w-56"
            aria-label="Search Community Archive"
            autoComplete="off"
          />
        </div>
        <Button
          asChild
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-l-none border-l-0"
        >
          <Link
            href={searchHref}
            aria-label="Open advanced search"
            title="Advanced search"
          >
            <ListFilter className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </form>
  )
}
