import UserDirectoryClient from './UserDirectoryClient'
import { getStats } from '@/lib/stats'

export default async function UserDirectoryPage() {
  const totalCount = await getStats()
    .then((stats) => stats.userCount)
    .catch((error) => {
      console.error('Error fetching the directory member count:', error)
      return null
    })

  return <UserDirectoryClient totalCount={totalCount} />
}
