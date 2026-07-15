'use client'

import AdvancedSearchForm from '@/components/AdvancedSearchForm'
import TweetList from '@/components/TweetList'
import { FilterCriteria } from '@/lib/queries/tweetQueries'
import { normalizeSearchParams } from '@/lib/searchParams'
import { Search, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const starterSearches = [
  { label: 'Open source', query: 'open source' },
  { label: 'AI alignment', query: 'AI alignment' },
  { label: 'Community notes', query: 'community notes' },
]

// This wrapper is needed because useSearchParams can only be used in Client Components,
// and Suspense is recommended for pages that use it.
function SearchPageContent() {
  const searchParams = useSearchParams()
  const normalizedSearchParams = normalizeSearchParams(
    new URLSearchParams(searchParams.toString()),
  )

  const rawQuery = normalizedSearchParams.get('q')
  let formattedQuery: string | undefined
  // Strip quotes if present, keep the clean text for two-query exact-match-first logic
  let cleanRawText: string | undefined

  if (rawQuery) {
    const trimmedQuery = rawQuery.trim()
    if (trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"')) {
      cleanRawText = trimmedQuery.substring(1, trimmedQuery.length - 1).trim()
    } else {
      cleanRawText = trimmedQuery
    }
    // For single-word queries or fallback, still provide a formatted query
    const words = cleanRawText.split(/\s+/).filter(Boolean)
    formattedQuery = words.join(' & ')
  }

  const filterCriteria: FilterCriteria = {
    searchQuery: formattedQuery,
    rawSearchQuery: cleanRawText,
    fromUsername: normalizedSearchParams.get('fromUser') || undefined,
    replyToUsername: normalizedSearchParams.get('replyToUser') || undefined,
    startDate: normalizedSearchParams.get('sinceDate') || undefined,
    endDate: normalizedSearchParams.get('untilDate') || undefined,
  }

  const tweetListKey = normalizedSearchParams.toString()
  const hasSearch = tweetListKey.length > 0
  const searchDescription = cleanRawText
    ? `Matching “${cleanRawText}” and the filters above`
    : 'Matching the filters above'

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
            <Search className="h-4 w-4" />
            Archive search
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Search the archive
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Find public conversations by keyword, author, reply, or date.
          </p>
        </div>

        <AdvancedSearchForm />

        <div className="mt-10">
          {hasSearch ? (
            <TweetList
              key={tweetListKey}
              filterCriteria={filterCriteria}
              resultsHeading="Search results"
              resultsDescription={searchDescription}
              collapseLongTweets
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center sm:px-10">
              <SlidersHorizontal className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-4 text-2xl font-semibold text-foreground">
                Start with a topic or phrase
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Use filters for a specific account or date range, or try one of
                these searches.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {starterSearches.map((item) => (
                  <Link
                    key={item.query}
                    href={`/search?q=${encodeURIComponent(item.query)}`}
                    className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default function SearchTweetsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-14 text-center text-muted-foreground">
          Loading search…
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
