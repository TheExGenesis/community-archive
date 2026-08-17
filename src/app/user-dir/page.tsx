import UserDirectoryClient from './UserDirectoryClient'
import { getStats } from '@/lib/stats'
import { getUserDirectoryPage } from '@/lib/userDirectory'

export default async function UserDirectoryPage() {
  const [totalCount, initialPage] = await Promise.all([
    getStats()
      .then((stats) => stats.userCount)
      .catch((error) => {
        console.error('Error fetching the directory member count:', error)
        return null
      }),
    getUserDirectoryPage().catch((error) => {
      console.error('Error fetching the initial user directory page:', error)
      return null
    }),
  ])

  return (
    <UserDirectoryClient
      totalCount={totalCount}
      initialUsers={initialPage?.users ?? null}
      initialHasMore={initialPage?.hasMore ?? true}
    />
  )
}
