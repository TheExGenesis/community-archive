import { getTweet } from '@/lib-server/tweet'
import Tweet from '@/components/TweetRefactor'

export default async function TweetPage({ params }:any) {
    const { tweet_id } = params
    const tweetResult = await getTweet(tweet_id)
    if (!tweetResult.data || tweetResult.data.length == 0) {
        return <h1>404: Tweet not found</h1>
    }

    const tweet:any = tweetResult.data[0]

    return (
            <Tweet key={tweet.tweet_id} tweet={tweet}/>
        )

}