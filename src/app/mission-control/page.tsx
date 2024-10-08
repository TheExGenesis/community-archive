import CommunityStats from '@/components/CommunityStats'
import TopMentionedUsers from '@/components/TopMentionedMissingUsers'
import { getArchiveMostMentionedAccounts } from '@/lib-client/queries/getMostMentionedAccounts'

export default async function StatsPage() {
  const topMentionedMissingUsers = await getArchiveMostMentionedAccounts()
  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-6 text-3xl font-bold">Mission Control</h1>

      <CommunityStats />

      <div className="rounded-lg bg-gray-100 p-4 shadow dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold">Most Wanted</h2>
        <p className="mb-4">Top mentioned users who are not in the archive</p>
        <TopMentionedUsers
          users={topMentionedMissingUsers}
          showUploadedDefault={false}
          showUploadedSwitch={true}
        />
      </div>
    </div>
  )
}
