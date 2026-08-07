import ClassicHomepage from '@/components/home/ClassicHomepage'
import Portal from '@/components/portal/Portal'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

// The first request after a daily analytics-cache rollover builds the bounded
// ClickHouse snapshot; subsequent member requests reuse the shared Data Cache.
export const maxDuration = 60

// Signed-in members get the live archive portal; everyone else sees the
// classic marketing homepage. Auth comes from cookies, so this page renders
// dynamically — the portal's data layer does its own caching (24h for heavy
// aggregates, minutes for stats and the initial stream).
export default async function Homepage() {
  if (!(await getIsMember())) {
    return <ClassicHomepage />
  }

  const data = await getPortalData()
  return <Portal data={data} view="home" />
}
