'use client'
import AdvancedSearchForm from '@/components/AdvancedSearchForm'
import TweetList from '@/components/TweetList';
import { FilterCriteria } from '@/lib/queries/tweetQueries';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Style definitions
const unifiedDeepBlueBase = "bg-white dark:bg-background";
const sectionPaddingClasses = "py-12 md:py-16 lg:py-20";
const contentWrapperClasses = "w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8";

// This wrapper is needed because useSearchParams can only be used in Client Components,
// and Suspense is recommended for pages that use it.
function SearchPageContent() {
  const searchParams = useSearchParams();

  // Construct FilterCriteria from URL search parameters
  const filterCriteria: FilterCriteria = {
    searchQuery: searchParams.get('q') || undefined,
    fromUsername: searchParams.get('fromUser') || undefined,
    replyToUsername: searchParams.get('replyToUser') || undefined,
    startDate: searchParams.get('sinceDate') || undefined,
    endDate: searchParams.get('untilDate') || undefined,
    // isRootTweet, mentionedUser, hashtags are not currently set by AdvancedSearchForm directly to URL params
    // They could be added if the form supports them explicitly or if 'q' is parsed for such syntax.
  };
  
  // A key for TweetList to force re-render when search params change, ensuring new data is fetched.
  // This is important because TweetList fetches data in its own useEffect based on initial props.
  const tweetListKey = searchParams.toString();

  return (
    <main> 
      <section 
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen`}
      >
        <div className={`${contentWrapperClasses}`}> 
          <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">🔬 Advanced Search</h2>
          <AdvancedSearchForm /> {/* This will pre-fill itself from URL params */}
          
          <div className="mt-12">
            {/* Render TweetList only if there are actual search parameters present */} 
            {searchParams.toString().length > 0 ? (
              <div className="bg-slate-100 dark:bg-card p-6 md:p-8 rounded-lg">
                <h3 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white">Search Results</h3>
                <TweetList 
                  key={tweetListKey} // Force re-mount on new search
                  filterCriteria={filterCriteria} 
                />
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 mt-12">Please enter your search criteria above.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SearchTweetsPage() {
  return (
    // Suspense boundary for useSearchParams
    <Suspense fallback={<div>Loading search...</div>}> 
      <SearchPageContent />
    </Suspense>
  );
}
