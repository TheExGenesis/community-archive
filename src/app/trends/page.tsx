import { redirect } from 'next/navigation'
import PortalComponentErrorBoundary from '@/components/portal/PortalComponentErrorBoundary'
import TrendsExplorer from '@/components/portal/TrendsExplorer'
import { getIsMember } from '@/lib/portal/auth'
import {
  getPortalTrendSnapshot,
  loadPortalComponentData,
} from '@/lib/portal/data'
import { emptyPortalTrends } from '@/lib/portal/trendConfig'

export const metadata = { title: 'Trends · Community Archive' }
export const maxDuration = 60

export default async function TrendsPage() {
  if (!(await getIsMember())) redirect('/')
  const initial = await loadPortalComponentData(
    'trends-explorer',
    getPortalTrendSnapshot,
    emptyPortalTrends(),
  )

  return (
    <PortalComponentErrorBoundary componentName="Trends explorer">
      <TrendsExplorer
        initialTrends={initial.data}
        initialLoadFailed={initial.failed}
      />
    </PortalComponentErrorBoundary>
  )
}
