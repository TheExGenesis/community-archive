import { Archive, Tweet } from '../types'

export const filterArchiveTweetsByDate = (
  archive: Archive,
  startDate: string,
  endDate: string,
): Archive => {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const filteredTweets = archive.tweets.filter((tweet: {tweet: Tweet}) => {
    const tweetDate = new Date(tweet.tweet.created_at)
    return tweetDate >= start && tweetDate <= end
  })

  return {
    ...archive,
    tweets: filteredTweets,
  }
}