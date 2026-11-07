'use client'

import dynamic from 'next/dynamic'
import type { FilterCriteria } from '@/lib/queries/tweetQueries'

const TweetList = dynamic(() => import('@/components/TweetList'), {
  loading: () => <p role="status">Loading results…</p>,
})

/** Archive text-search results for one trend term, minus the featured tweets. */
export default function TrendStorySearch({
  term,
  since,
  until,
  excludeTweetIds,
  returnTo,
}: {
  term: string
  since: string
  until: string
  excludeTweetIds: string[]
  returnTo: string
}) {
  // Ordering by likes needs ClickHouse search; otherwise fall back to newest.
  const byLikes = process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH === 'true'
  const words = term.split(/\s+/).filter(Boolean)
  const filterCriteria: FilterCriteria = {
    searchQuery: words.join(' & '),
    rawSearchQuery: term,
    startDate: since,
    endDate: until,
    excludeRetweets: true,
    includeQuoteTweets: true,
    sort: byLikes ? 'likes' : 'newest',
  }
  return (
    <TweetList
      filterCriteria={filterCriteria}
      resultsHeading={`All tweets mentioning “${term}”`}
      resultsDescription={`${byLikes ? 'Most-liked' : 'Newest'} first, during the trend window`}
      excludeTweetIds={excludeTweetIds}
      showCsvExportButton={false}
      collapseLongTweets
      compact
      permalinkOrigin="trends"
      permalinkReturnTo={returnTo}
    />
  )
}
