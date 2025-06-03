'use client'

import TweetList from '@/components/TweetList';
import { FilterCriteria } from '@/lib/queries/tweetQueries';

// Basic styling, can be enhanced
const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";
const sectionPaddingClasses = "py-12 md:py-16";
const contentWrapperClasses = "w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8";

export default function TimelinePage() {
  // Define the filter criteria for the main timeline
  // We want root tweets (not replies)
  const timelineFilterCriteria: FilterCriteria = {
    isRootTweet: true, 
    // No specific userId, searchQuery, etc., so it fetches all root tweets
  };

  return (
    <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen flex flex-col items-center`}>
      <div className={contentWrapperClasses}>
        <h1 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">Timeline</h1>
        <TweetList 
          filterCriteria={timelineFilterCriteria} 
          itemsPerPage={50} // Or use the default in TweetList
        />
      </div>
    </main>
  );
} 