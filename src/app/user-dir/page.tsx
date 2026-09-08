import { Suspense } from 'react'
import UserDirectoryClient from './UserDirectoryClient'
import { getStats } from '@/lib/stats'
import { getUserDirectoryPage } from '@/lib/userDirectory'

export default async function UserDirectoryPage() {
  const totalCount = getStats()
    .then((stats) => stats.userCount)
    .catch((error) => {
      console.error('Error fetching the directory member count:', error)
      return null
    })
  const initialPage = await getUserDirectoryPage().catch((error) => {
    console.error('Error fetching the initial user directory page:', error)
    return null
  })

  return (
    <UserDirectoryClient
      totalCount={null}
      totalCountSlot={
        <Suspense fallback="…">
          <DirectoryTotal result={totalCount} />
        </Suspense>
      }
      initialUsers={initialPage?.users ?? null}
      initialHasMore={initialPage?.hasMore ?? true}
    />
  )
}

async function DirectoryTotal({ result }: { result: Promise<number | null> }) {
  const count = await result
  return <>{count === null ? 'unknown' : count.toLocaleString('en-US')}</>
}
