'use client'

import { useState, useEffect } from 'react'
import Tweet from '@/components/Tweet'
import { createBrowserClient } from '@/utils/supabase'

const fetchTweets = async (supabase: any) => {
  const { data: tweets, error } = await supabase
    .schema('public')
    .from('tweets')
    .select(
      `
    *,
    account!inner (
      profile (
        avatar_media_url
      ),
      username,
      account_display_name
    )
    
  `,
    )
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  return tweets
}

export default function TweetsPage() {
  const [tweets, setTweets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900"
  const sectionPaddingClasses = "py-16 md:py-20"
  const contentWrapperClasses = "w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
  const glowBaseColor = "hsla(200, 100%, 60%,"
  const glowStyleStrong = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.2) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createBrowserClient()
        const fetchedTweets = await fetchTweets(supabase)
        setTweets(fetchedTweets || [])
      } catch (e) {
        console.error(e)
        setError('Failed to load recent tweets.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen flex items-center justify-center`} style={glowStyleStrong}>
        <p className="text-xl text-gray-700 dark:text-gray-300">Loading recent tweets...</p>
      </main>
    )
  }
  
  if (error) {
    return (
      <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen flex items-center justify-center`} style={glowStyleStrong}>
        <p className="text-xl text-red-500">Error: {error}</p>
      </main>
    )
  }

  return (
    <main> 
      <section 
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen`}
        style={glowStyleStrong}
      >
        <div className={`${contentWrapperClasses}`}> 
          <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">📜 Recent Tweets</h2>
          <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-lg shadow-xl space-y-8">
            {tweets.length > 0 ? (
              tweets.map((tweet: any) => (
                <Tweet
                  key={tweet.tweet_id}
                  tweet={tweet}
                />
              ))
            ) : (
              <p className="text-center py-4 text-gray-600 dark:text-gray-300">No recent tweets found.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
