import CommunityStats from '@/components/CommunityStats'
import TopMentionedUsers from '@/components/TopMentionedMissingUsers'
import { getArchiveMostMentionedAccounts } from '@/lib/queries/getMostMentionedAccounts'
import { getStats } from '@/lib/stats'

// export const revalidate = 0; // TODO: Decide on revalidation strategy

export default async function MissionControlPage() {
  const stats = await getStats().catch((error) => {
    console.error('Failed to fetch stats for mission control:', error)
    return {
      userCount: null,
      tweetCount: null,
    }
  })

  const topMentionedMissingUsers = await getArchiveMostMentionedAccounts()

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Mission Control</h1>

      <CommunityStats
        userCount={stats.userCount}
        tweetCount={stats.tweetCount}
      />

      <div className="rounded-lg bg-muted p-4 shadow">
        <h2 className="mb-4 text-xl font-semibold">Most Wanted</h2>
        <p className="mb-4">Top mentioned users who are not in the archive</p>
        <TopMentionedUsers
          users={topMentionedMissingUsers}
          showUploadedDefault={false}
          showUploadedSwitch={true}
        />
      </div>

      {/* Add more sections as needed for admin functionalities */}
    </div>
  )
}
