import Portal from '@/components/portal/Portal'
import { getPortalData } from '@/lib/portal/data'

// Light stats and the initial stream refresh every 5 minutes; the heavy
// trend/weather aggregates behind getPortalData are cached for 24h, so the
// portal changes day to day without hammering the database.
export const revalidate = 300

export default async function Homepage() {
  const data = await getPortalData()
  return <Portal data={data} />
}
