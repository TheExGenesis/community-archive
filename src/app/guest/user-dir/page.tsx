import GuestUserDirectory from '@/components/GuestUserDirectory'
import { getUserDirectoryPage } from '@/lib/userDirectory'

/**
 * The signed-out view of /user-dir. The middleware rewrites guest document
 * requests here so every visitor shares one cached render instead of a
 * redirect to the login page.
 */
export const dynamic = 'force-static'
export const revalidate = 300

export const metadata = {
  title: 'Member directory · Community Archive',
  description:
    'Browse the members of Community Archive and their archived tweets.',
}

export default async function GuestUserDirectoryPage() {
  const page = await getUserDirectoryPage().catch((error) => {
    console.error('Error fetching the guest user directory page:', error)
    return null
  })
  return <GuestUserDirectory users={page?.users ?? null} />
}
