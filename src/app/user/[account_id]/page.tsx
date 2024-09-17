import './user.css'
import { getUserData, getFirstTweets, getTopTweets } from '@/lib-server/user'
import Tweet from '@/components/Tweet'
import SearchTweets from '@/components/SearchTweets'

export default async function User({ params, searchParams }: any) {
  const { account_id } = params
  const userData = await getUserData(account_id)
  if (!userData) {
    return <h1>Not found</h1>
  }

  const { tweetCount, account } = userData
  const firstTweets = await getFirstTweets(account.account_id)
  const topTweets = await getTopTweets(account.account_id)

  return (
    <div
      id="user-page"
      className="relative mx-auto w-full max-w-6xl bg-white p-24 dark:bg-gray-800"
    >
      <h1>
        {account.username} (
        {new Intl.NumberFormat().format(tweetCount as number)} tweets)
      </h1>

      <SearchTweets
        displayText={`Search ${account.username}'s archive`}
        account_id={account.account_id}
      />
      <hr style={{ marginBottom: '50px' }} />
      {topTweets && topTweets.length > 0 && (
        <>
          <h2>Top 20 tweets</h2>
          <div className="short-tweet-container">
            {topTweets.map((tweet: any) => (
              <Tweet
                key={tweet.tweet_id}
                username={tweet.username}
                displayName={tweet.display_name}
                profilePicUrl={tweet.profile_image_url}
                text={tweet.text}
                favoriteCount={tweet.favorite_count}
                retweetCount={tweet.retweet_count}
                date={tweet.created_at}
                tweetUrl={`https://twitter.com/${tweet.username}/status/${tweet.tweet_id}`}
                tweetId={tweet.tweet_id}
                replyToUsername={tweet.in_reply_to_screen_name}
              />
            ))}
          </div>
        </>
      )}

      {firstTweets && firstTweets.length > 0 && (
        <>
          <h2>First 100 tweets</h2>
          <div className="short-tweet-container">
            {firstTweets.map((tweet: any) => (
              <Tweet
                key={tweet.tweet_id}
                username={tweet.username}
                displayName={tweet.display_name}
                profilePicUrl={tweet.profile_image_url}
                text={tweet.text}
                favoriteCount={tweet.favorite_count}
                retweetCount={tweet.retweet_count}
                date={tweet.created_at}
                tweetUrl={`https://twitter.com/${tweet.username}/status/${tweet.tweet_id}`}
                tweetId={tweet.tweet_id}
                replyToUsername={tweet.in_reply_to_screen_name}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
