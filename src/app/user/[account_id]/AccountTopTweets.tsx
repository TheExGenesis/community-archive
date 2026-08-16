import { Suspense } from 'react'
import AccountTopTweetsClient from './AccountTopTweetsClient'
import { FormattedUser } from '@/lib/types'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { PopularTweet } from '@/lib/types'

const AccountTopTweets = async ({ userData }: { userData: FormattedUser }) => {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  if (!userData.account_id) return null

  const selection =
    'tweet_id,account_id,created_at,full_text,retweet_count,favorite_count,reply_to_tweet_id,reply_to_user_id,reply_to_username,archive_upload_id'
  const [favoritedResult, retweetedResult] = await Promise.all([
    supabase
      .from('tweets')
      .select(selection)
      .eq('account_id', userData.account_id)
      .order('favorite_count', { ascending: false })
      .limit(100),
    supabase
      .from('tweets')
      .select(selection)
      .eq('account_id', userData.account_id)
      .order('retweet_count', { ascending: false })
      .limit(100),
  ])

  if (favoritedResult.error || retweetedResult.error) {
    return <div>Error fetching data</div>
  }

  const favorited = (favoritedResult.data ?? []) as unknown as PopularTweet[]
  const retweeted = (retweetedResult.data ?? []) as unknown as PopularTweet[]

  const tweetData = {
    // liked: data.most_liked_tweets_by_archive_users,
    // replied: data.most_replied_tweets_by_archive_users,
    favorited,
    retweeted,
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AccountTopTweetsClient
        tweetData={tweetData}
        username={userData.username}
        displayName={userData.account_display_name}
        profilePicUrl={userData.avatar_media_url || '/placeholder.jpg'}
      />
    </Suspense>
  )
}

export default AccountTopTweets
