import { Suspense } from 'react'
import AccountTopTweetsClient from './AccountTopTweetsClient'
import { FormattedUser } from '@/lib/types'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib/devLog'
import { PopularTweet } from '@/lib/types'
import { repairProfileTweetText } from '@/lib/profileTweetText'

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

  const favorited = data.most_favorited_tweets as PopularTweet[]
  const retweeted = data.most_retweeted_tweets as PopularTweet[]
  const repaired = await repairProfileTweetText(
    Array.from(
      new Map(
        [...favorited, ...retweeted].map((tweet) => [tweet.tweet_id, tweet]),
      ).values(),
    ),
  )
  const repairedById = new Map(repaired.map((tweet) => [tweet.tweet_id, tweet]))
  const withRepairedText = (tweets: PopularTweet[]) =>
    tweets.map((tweet) => repairedById.get(tweet.tweet_id) ?? tweet)

  const tweetData = {
    // liked: data.most_liked_tweets_by_archive_users,
    // replied: data.most_replied_tweets_by_archive_users,
    favorited: withRepairedText(favorited),
    retweeted: withRepairedText(retweeted),
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
