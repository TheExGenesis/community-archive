import './user.css'
import { getUserData, getFirstTweets, getTopTweets } from '@/lib-server/user'
import Tweet from '@/components/TweetRefactor'

export default async function User({ params, searchParams }:any) {
    const { username } = params
    const userData = await getUserData(username.toLowerCase())
    if (!userData) {
      return (<h1>Not found</h1>)
    }

    const { tweetCount, account } = userData
    const firstTweets = await getFirstTweets(account.account_id)
    const topTweets = await getTopTweets(account.account_id)

    return (
      <div id="user-page">
        <h1>{username} ({new Intl.NumberFormat().format(tweetCount as number)} tweets)</h1>
        
        <h2>Top 20 tweets</h2>
        <div className="short-tweet-container">
          {topTweets && topTweets.map((tweet: any) => (
            <Tweet key={tweet.tweet_id} tweet={tweet}/>
          ))}
        </div>
        
        <h2>First 100 tweets</h2>
        <div className="short-tweet-container">
          {firstTweets && firstTweets.map((tweet: any) => (
            <Tweet key={tweet.tweet_id} tweet={tweet}/>
          ))}
        </div>
      </div>
    )
}