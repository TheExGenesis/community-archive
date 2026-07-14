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
  const unifiedDeepBlueBase = 'bg-card dark:bg-background'
  const sectionPaddingClasses = 'py-12 md:py-16 lg:py-20'
  // Using max-w-7xl to match stream monitor width
  const contentWrapperClasses = 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'

  if (!tweet) {
    notFound()
  }

  return (
    <main>
      <section
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen overflow-hidden`}
      >
        <div className={`${contentWrapperClasses}`}>
          <div className="rounded-lg bg-muted p-6 dark:bg-card md:p-8">
            <h2 className="mb-8 text-center text-4xl font-bold text-foreground">
              {threadTree && Object.keys(threadTree.tweets).length > 1
                ? '🧵 View Thread'
                : '🔎 View Tweet'}
            </h2>

            {threadTree && Object.keys(threadTree.tweets).length > 1 ? (
              <ThreadView
                tree={threadTree}
                highlightTweetId={tweet_id}
                className="rounded-lg bg-background dark:bg-secondary"
              />
            ) : (
              <div className="rounded-lg bg-background p-4 dark:bg-secondary">
                <TweetComponent key={tweet.tweet_id} tweet={tweet} />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
