import { Archive, ArchiveStats } from '../types'

export const calculateArchiveStats = (archive: Archive): ArchiveStats => {
  const username = archive.account[0].account.username
  const accountDisplayName = archive.account[0].account.accountDisplayName
  const avatarMediaUrl = archive.profile[0].profile.avatarMediaUrl
  const tweetCount = archive.tweets.length
  const likesCount = archive.like.length
  const followerCount = archive.follower.length
  const earliestTweetDate = archive.tweets.reduce(
    (earliest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return earliest
        ? tweetDate < new Date(earliest)
          ? tweetDate.toISOString()
          : earliest
        : tweetDate.toISOString()
    },
    '',
  )
  const latestTweetDate = archive.tweets.reduce(
    (latest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return latest
        ? tweetDate > new Date(latest)
          ? tweetDate.toISOString()
          : latest
        : tweetDate.toISOString()
    },
    '',
  )

  return {
    username,
    accountDisplayName,
    avatarMediaUrl,
    tweetCount,
    likesCount,
    followerCount,
    earliestTweetDate,
    latestTweetDate,
  }
}
