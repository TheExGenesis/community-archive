import Portal from '@/components/portal/Portal'
import { getPortalData } from '@/lib/portal/data'

export const metadata = { title: 'Stream · Community Archive' }
// Keep the stream and homepage on the same request-time analytics snapshots;
// portal fallbacks must not turn a static-render probe into cached route data.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function StreamPage() {
  const data = await getPortalData('stream')
  return <Portal data={data} view="stream" />
}
