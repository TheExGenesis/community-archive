'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import UserSearchInput from '@/components/UserSearchInput'
import { capturePostHogEvent } from '@/lib/posthog'
import { buildSearchParams } from '@/lib/searchParams'

const exampleSearches = ['open source', 'AI alignment', 'from:vitalikbuterin']

export default function HomepageSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const search = (expression: string) => {
    const trimmedQuery = expression.trim()
    if (!trimmedQuery) return

    const params = buildSearchParams(trimmedQuery)
    capturePostHogEvent('archive_search_submitted', {
      has_query: true,
      active_filter_count: 0,
      surface: 'homepage',
    })
    router.push(`/search?${params.toString()}`)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    search(query)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="relative rounded-lg border border-border bg-card p-1.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.10)] sm:p-2"
      >
        <UserSearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search tweets, people, ideas"
          aria-label="Search Community Archive"
          className="h-14 border-0 bg-transparent pl-3 pr-16 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-[360px]:text-base sm:pl-4 sm:text-lg"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-2.5 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 focus-visible:ring-brand sm:right-3"
          aria-label="Search archive"
        >
          <Search className="h-5 w-5" />
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground sm:text-sm">
        <span>Try:</span>
        {exampleSearches.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => search(example)}
            className="font-medium text-foreground underline-offset-4 transition-colors hover:text-brand hover:underline"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}
