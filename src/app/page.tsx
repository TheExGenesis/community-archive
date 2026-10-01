import ClassicHomepage from '@/components/home/ClassicHomepage'
import HomepagePeople from '@/components/home/HomepagePeople'
import MemberHomepage from '@/components/home/MemberHomepage'
import { hasPendingOptInAction } from '@/lib/homepageAccess'
import { getCurrentUser, getIsMember } from '@/lib/portal/auth'
import { startHomepageData, startMemberHomepageData } from '@/lib/portal/data'

// The first request after a daily analytics-cache rollover builds the bounded
// ClickHouse snapshot; subsequent homepage requests reuse the shared Data Cache.
// Force request-time rendering so the portal's component fallbacks do not catch
// Next's static-render probe and freeze build-time fallback data into this route.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Visitors get the pitch and the public dashboard. Signed-in members get their
// own home: the digest, their archive, and the shared feeds, with no pitch.
// A pending ?action=optin keeps the visitor page so the hero can finish the
// opt-in it started before sign-in.
interface HomepageProps {
  searchParams?: {
    action?: string | string[]
  }
}

export default async function Homepage({ searchParams }: HomepageProps = {}) {
  const isMember = await getIsMember()
  const pendingOptIn = hasPendingOptInAction(searchParams?.action)

  if (isMember && !pendingOptIn) {
    // getCurrentUser is request-cached, so this reuses getIsMember's read.
    const data = startMemberHomepageData()
    return <MemberHomepage data={data} user={await getCurrentUser()} />
  }

  // Start the heavier portal request immediately, but do not hold the hero or
  // curated people behind it. ClassicHomepage streams the data-dependent
  // regions through their own Suspense boundaries.
  const data = startHomepageData()
  return (
    <ClassicHomepage
      data={data}
      isMember={isMember}
      showCta={!isMember || pendingOptIn}
      homepagePeople={<HomepagePeople />}
    />
  )
}
