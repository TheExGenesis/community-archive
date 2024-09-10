import { getStats } from '@/lib-server/stats'

const CommunityStats = async () => {
  // TODO: make it show loading here?
  // useSWR?
  // https://nextjs.org/docs/pages/building-your-application/rendering/client-side-rendering

  const stats = await getStats()

  return (
    <div>
      {stats.accountCount !== null &&
        stats.tweetCount !== null &&
        stats.likedTweetCount !== null && (
          <p className="mb-4 text-sm">
            <strong>{stats.accountCount}</strong> accounts have uploaded a total
            of <strong>{stats.tweetCount}</strong> tweets. We also have{' '}
            <strong>{stats.likedTweetCount}</strong> liked tweets.
          </p>
        )}
      {stats.usernames && stats.usernames.length > 0 && (
        <p className="mb-4 text-sm">
          Accounts in the archive: {stats.usernames.join(', ')}
        </p>
      )}
    </div>
  )
}

export default CommunityStats
