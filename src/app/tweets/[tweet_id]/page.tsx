import { getTweet } from '@/lib/tweet'
import { getThreadTree } from '@/lib/threadUtils'
import TweetComponent from '@/components/TweetComponent'
import ThreadView from '@/components/ThreadView'

export default async function TweetPage({ params }: any) {
  
  const { tweet_id } = params
  const [tweetResult, threadTree] = await Promise.all([
    getTweet(tweet_id),
    getThreadTree(tweet_id)
  ])

  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-white dark:bg-background";
  const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
  // Using max-w-7xl to match stream monitor width
  const contentWrapperClasses = "w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"

  if (!tweetResult.data || tweetResult.data.length === 0) {
    return (
      <main>
        <section 
          className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen flex flex-col items-center justify-center`}
        >
          <div className={`${contentWrapperClasses} text-center`}>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
            <p className="text-xl text-gray-700 dark:text-gray-300">Tweet not found.</p>
          </div>
        </section>
      </main>
    )
  }

  const tweet: any = tweetResult.data[0]

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
