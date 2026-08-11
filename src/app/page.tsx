import ClassicHomepage from '@/components/home/ClassicHomepage'
import Portal from '@/components/portal/Portal'
import { hasPendingOptInAction } from '@/lib/homepageAccess'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

// The first request after a daily analytics-cache rollover builds the bounded
// ClickHouse snapshot; subsequent member requests reuse the shared Data Cache.
export const maxDuration = 60

// Signed-in members get the live archive portal; everyone else sees the
// classic marketing homepage. Auth comes from cookies, so this page renders
// dynamically — the portal's data layer does its own caching (24h for heavy
// aggregates, minutes for stats and the initial stream).
interface HomepageProps {
  searchParams?: {
    action?: string | string[]
  }
}

export default async function Homepage({ searchParams }: HomepageProps = {}) {
  // OAuth returns to /?action=optin. Even though the new session makes this
  // user eligible for the signed-in portal, keep this request on the classic
  // homepage so HeroCTAButtons can consume and persist the pending consent
  // action before the portal branch takes over.
  if (hasPendingOptInAction(searchParams?.action)) {
    return <ClassicHomepage />
  }

  if (!(await getIsMember())) {
    return <ClassicHomepage />
  }

  const data = await getPortalData()
  return <Portal data={data} view="home" />
}
