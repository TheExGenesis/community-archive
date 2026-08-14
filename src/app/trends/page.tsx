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

function serializedSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams()
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item))
    } else if (value !== undefined) {
      params.set(key, value)
    }
  })
  return params.toString()
}

export default async function TrendsPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  if (!(await getIsMember())) redirect('/login?redirect=/trends')
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
        initialSearch={serializedSearchParams(searchParams)}
      />
    </PortalComponentErrorBoundary>
  )
}
