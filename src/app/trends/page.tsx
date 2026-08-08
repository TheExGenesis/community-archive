import { redirect } from 'next/navigation'
import TrendsExplorer from '@/components/portal/TrendsExplorer'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalTrendSnapshot } from '@/lib/portal/data'

export const metadata = { title: 'Trends · Community Archive' }
export const maxDuration = 60

export default async function TrendsPage() {
  if (!(await getIsMember())) redirect('/')
  const trends = await getPortalTrendSnapshot()
  return <TrendsExplorer initialTrends={trends} />
}
