'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/formatNumber'
import { buildSearchParams } from '@/lib/searchParams'

interface HomepageSearchProps {
  tweetCount: number | null
  userCount: number | null
}

const exampleSearches = ['open source', 'AI alignment', 'from:vitalikbuterin']

export default function HomepageSearch({
  tweetCount,
  userCount,
}: HomepageSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const search = (expression: string) => {
    const trimmedQuery = expression.trim()
    if (!trimmedQuery) return

    const params = buildSearchParams(trimmedQuery)
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
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left shadow-lg sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tweets, people, and ideas"
            aria-label="Search Community Archive"
            className="h-14 border-0 bg-transparent pl-12 pr-4 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!query.trim()}
          className="h-14 bg-brand px-7 text-brand-foreground hover:bg-brand/90"
        >
          Search
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </form>

      <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
        <p>
          Search {formatNumber(tweetCount)} tweets from{' '}
          {formatNumber(userCount)} participating members.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
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
    </div>
  )
}
