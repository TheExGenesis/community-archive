import { getTweetPageData } from '@/lib/getTweetPageData'
import { notFound } from 'next/navigation'
import TweetComponent from '@/components/TweetComponent'
import ThreadView from '@/components/ThreadView'

// ISR: serve from CDN cache, revalidate at most once per hour
export const revalidate = 3600

export default async function TweetPage({ params }: any) {
  const { tweet_id } = params
  const { tweet, threadTree } = await getTweetPageData(tweet_id)

  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-white dark:bg-background";
  const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
  // Using max-w-7xl to match stream monitor width
  const contentWrapperClasses = "w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"

  if (!tweet) {
    notFound()
  }

  return (
    <main>
      <section
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen`}
      >
        <div className={`${contentWrapperClasses}`}>
          <div className="bg-slate-100 dark:bg-card p-6 md:p-8 rounded-lg">
            <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">
              {threadTree && Object.keys(threadTree.tweets).length > 1 ? '🧵 View Thread' : '🔎 View Tweet'}
            </h2>

            {threadTree && Object.keys(threadTree.tweets).length > 1 ? (
              <ThreadView
                tree={threadTree}
                highlightTweetId={tweet_id}
                className="bg-background dark:bg-secondary rounded-lg"
              />
            ) : (
              <div className="bg-background dark:bg-secondary p-4 rounded-lg">
                <TweetComponent key={tweet.tweet_id} tweet={tweet} />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
