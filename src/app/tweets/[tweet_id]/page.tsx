import { getTweet } from '@/lib/tweet'
import Tweet from '@/components/Tweet'

export default async function TweetPage({ params }: any) {
  const { tweet_id } = params
  const tweetResult = await getTweet(tweet_id)

  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";
  const sectionPaddingClasses = "py-16 md:py-20"
  // Using max-w-2xl for a single tweet display
  const contentWrapperClasses = "w-full max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
  const glowBaseColor = "hsla(200, 100%, 60%,"
  const glowStyleStrong = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.2) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }

  if (!tweetResult.data || tweetResult.data.length === 0) {
    return (
      <main>
        <section 
          className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen flex flex-col items-center justify-center`}
          style={glowStyleStrong}
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
        style={glowStyleStrong}
      >
        <div className={`${contentWrapperClasses}`}> 
          <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">🔎 View Tweet</h2>
          <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-lg shadow-xl">
            {/* Ensure TweetRefactor component handles its own internal styling well within this card */}
            <Tweet key={tweet.tweet_id} tweet={tweet} />
          </div>
        </div>
      </section>
    </main>
  )
}
