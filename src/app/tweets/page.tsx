'use client'

import TweetList from '@/components/TweetList'
import { FilterCriteria } from '@/lib/queries/tweetQueries'

// Basic styling, can be enhanced
const unifiedDeepBlueBase = 'bg-card dark:bg-background'
const sectionPaddingClasses = 'py-8 md:py-10 lg:py-12'
const contentWrapperClasses = 'w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8'

export default function TweetsPage() {
  // Renamed from TimelinePage
  // Define the filter criteria for the main timeline
  // We want root tweets (not replies)
  const timelineFilterCriteria: FilterCriteria = {
    isRootTweet: true,
    // No specific userId, searchQuery, etc., so it fetches all root tweets
  }

  return (
    <main
      className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} flex min-h-screen flex-col items-center`}
    >
      <div className={`${contentWrapperClasses}`}>
        <div className="rounded-lg bg-muted p-6 dark:bg-card md:p-8">
          <h1 className="mb-12 text-center text-4xl font-bold text-foreground">
            Recent Tweets
          </h1>
          <TweetList
            filterCriteria={timelineFilterCriteria}
            itemsPerPage={50} // Or use the default in TweetList
          />
        </div>
      </div>
    </main>
  )
}
