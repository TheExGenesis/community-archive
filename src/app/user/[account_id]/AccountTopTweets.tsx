import { Suspense } from 'react'
import AccountTopTweetsClient from './AccountTopTweetsClient'
import { FormattedUser } from '@/lib-client/types'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib-client/devLog'
import { PopularTweet } from '@/lib-client/types'

const AccountTopTweets = async ({ userData }: { userData: FormattedUser }) => {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const { data, error } = await supabase
    .from('account_activity_summary')
    .select('most_retweeted_tweets, most_favorited_tweets')
    .eq('username', userData.username)
    .single()
  // devLog('account_activity_summary', data)

  if (error || !data) {
    return <div>Error fetching data</div>
  }

  if (
    !Array.isArray(data.most_favorited_tweets) ||
    !Array.isArray(data.most_retweeted_tweets)
  ) {
    return <div>Invalid data format</div>
  }

  const tweetData = {
    // liked: data.most_liked_tweets_by_archive_users,
    // replied: data.most_replied_tweets_by_archive_users,
    favorited: data.most_favorited_tweets as PopularTweet[],
    retweeted: data.most_retweeted_tweets as PopularTweet[],
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
