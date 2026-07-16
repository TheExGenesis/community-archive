'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildSearchParams } from '@/lib/searchParams'

const exampleSearches = ['open source', 'AI alignment', 'from:vitalikbuterin']

export default function HomepageSearch() {
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
        className="relative rounded-xl border border-border bg-card p-2 text-left shadow-lg transition-[border-color,box-shadow] focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/25 dark:focus-within:border-green-400 dark:focus-within:ring-green-400/20"
      >
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tweets, people, and ideas"
          aria-label="Search Community Archive"
          className="h-14 border-0 bg-transparent pl-4 pr-14 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg"
          autoFocus
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-green-600 text-white shadow-sm hover:bg-green-700 focus-visible:ring-green-600 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300 dark:focus-visible:ring-green-400"
          aria-label="Search archive"
        >
          <Search className="h-5 w-5" />
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
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
