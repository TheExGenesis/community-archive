import ClassicHomepage from '@/components/home/ClassicHomepage'
import Portal from '@/components/portal/Portal'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

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
