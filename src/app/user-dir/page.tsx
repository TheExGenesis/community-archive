import { requireBrowsingUser } from '@/lib/browsingAuth'
import { checkIsAdmin } from '@/app/admin/data'
import UserDirectoryClient from './UserDirectoryClient'
import { getUserDirectoryPage } from '@/lib/userDirectory'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Member directory · Community Archive',
  description:
    'Browse the members of Community Archive and their archived tweets.',
}

export default async function UserDirectoryPage() {
  await requireBrowsingUser('/user-dir')
  const [isAdmin, initialPage] = await Promise.all([
    checkIsAdmin(),
    getUserDirectoryPage().catch((error) => {
      console.error('Error fetching the initial user directory page:', error)
      return null
    }),
  ])

  return (
    <UserDirectoryClient
      totalCount={null}
      isAdmin={isAdmin}
      initialUsers={initialPage?.users ?? null}
      initialHasMore={initialPage?.hasMore ?? true}
      initialNextOffset={initialPage?.nextOffset}
    />
  )
}
