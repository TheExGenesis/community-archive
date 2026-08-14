import ClassicHomepage from '@/components/home/ClassicHomepage'
import { hasPendingOptInAction } from '@/lib/homepageAccess'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

// The first request after a daily analytics-cache rollover builds the bounded
// ClickHouse snapshot; subsequent homepage requests reuse the shared Data Cache.
// Force request-time rendering so the portal's component fallbacks do not catch
// Next's static-render probe and freeze build-time fallback data into this route.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Guests and members share one homepage/dashboard composition. Authentication
// only selects the hero action and access links; the portal data layer handles
// its own caching (24h for heavy aggregates, minutes for stats and the stream).
interface HomepageProps {
  searchParams?: {
    action?: string | string[]
  }
}

export default async function Homepage({ searchParams }: HomepageProps = {}) {
  const [isMember, data] = await Promise.all([getIsMember(), getPortalData()])
  return (
    <ClassicHomepage
      data={data}
      isMember={isMember}
      showCta={!isMember || hasPendingOptInAction(searchParams?.action)}
    />
  )
}
