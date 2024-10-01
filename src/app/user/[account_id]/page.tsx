import './user.css'
import { getUserData, getFirstTweets, getTopTweets } from '@/lib-server/user'
import Tweet from '@/components/Tweet'
import SearchTweets from '@/components/SearchTweets'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export default async function User({ params, searchParams }: any) {
  const { account_id } = params
  const userData = await getUserData(account_id)
  if (!userData) {
    return <h1>Not found</h1>
  }

  const account = userData
  const firstTweets = await getFirstTweets(account.account_id)
  const topTweets = await getTopTweets(account.account_id)

  return (
    <div
      id="user-page"
      className="relative mx-auto w-full max-w-3xl bg-white p-24 dark:bg-gray-800"
    >
      {/* User Profile Section */}
      <div className="mb-8 flex items-center space-x-4">
        <Avatar className="h-24 w-24">
          <AvatarImage
            src={account.avatar_media_url || '/placeholder.jpg'}
            alt={`${account.account_display_name}'s avatar`}
          />
          <AvatarFallback>
            {account.account_display_name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{account.account_display_name}</h1>
          <p className="text-gray-600">@{account.username}</p>
          {account.bio && <p className="mt-2">{account.bio}</p>}
          {account.location && (
            <p className="text-gray-600">{account.location}</p>
          )}
          <p className="text-sm text-gray-500">
            Joined: {new Date(account.created_at).toLocaleDateString()}
          </p>
          {account.archive_at && (
            <p className="text-sm text-gray-500">
              Archived: {new Date(account.archive_at).toLocaleDateString()}
            </p>
          )}
          <div className="mt-4 flex space-x-4 text-sm text-gray-600">
            <p>{new Intl.NumberFormat().format(account.num_tweets)} Tweets</p>
            <p>
              {new Intl.NumberFormat().format(account.num_followers)} Followers
            </p>
            <p>
              {new Intl.NumberFormat().format(account.num_following)} Following
            </p>
            <p>{new Intl.NumberFormat().format(account.num_likes)} Likes</p>
          </div>
        </div>
      </div>

      <div className="h-screen overflow-y-auto">
        <SearchTweets
          supabase={supabase}
          displayText={`Search ${account.username}'s archive`}
          account_id={account.account_id}
        />
      </div>
      <hr style={{ marginBottom: '50px' }} />
      {/* {topTweets && topTweets.length > 0 && (
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
      )} */}
    </div>
  )
}
