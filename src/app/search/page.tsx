'use client'
import AdvancedSearchForm from '@/components/AdvancedSearchForm'
import TweetList from '@/components/TweetList'
import { FilterCriteria } from '@/lib/queries/tweetQueries'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Style definitions
const unifiedDeepBlueBase = 'bg-card dark:bg-background'
const sectionPaddingClasses = 'py-12 md:py-16 lg:py-20'
const contentWrapperClasses = 'w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'

// This wrapper is needed because useSearchParams can only be used in Client Components,
// and Suspense is recommended for pages that use it.
function SearchPageContent() {
  const searchParams = useSearchParams()

  const rawQuery = searchParams.get('q')
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

  // Construct FilterCriteria from URL search parameters
  const filterCriteria: FilterCriteria = {
    searchQuery: formattedQuery,
    rawSearchQuery: cleanRawText,
    fromUsername: searchParams.get('fromUser') || undefined,
    replyToUsername: searchParams.get('replyToUser') || undefined,
    startDate: searchParams.get('sinceDate') || undefined,
    endDate: searchParams.get('untilDate') || undefined,
  }

  // A key for TweetList to force re-render when search params change, ensuring new data is fetched.
  // This is important because TweetList fetches data in its own useEffect based on initial props.
  const tweetListKey = searchParams.toString()

  return (
    <main>
      <section
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen overflow-hidden`}
      >
        <div className={`${contentWrapperClasses}`}>
          <h2 className="mb-8 text-center text-4xl font-bold text-foreground">
            🔬 Advanced Search
          </h2>
          <AdvancedSearchForm />{' '}
          {/* This will pre-fill itself from URL params */}
          <div className="mt-12">
            {/* Render TweetList only if there are actual search parameters present */}
            {searchParams.toString().length > 0 ? (
              <div className="rounded-lg bg-muted p-6 dark:bg-card md:p-8">
                <h3 className="mb-6 text-2xl font-semibold text-foreground">
                  Search Results
                </h3>
                <TweetList
                  key={tweetListKey} // Force re-mount on new search
                  filterCriteria={filterCriteria}
                />
              </div>
            ) : (
              <p className="mt-12 text-center text-muted-foreground">
                Please enter your search criteria above.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default function SearchTweetsPage() {
  return (
    // Suspense boundary for useSearchParams
    <Suspense fallback={<div>Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  )
}
