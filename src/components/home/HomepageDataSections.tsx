import Portal from '@/components/portal/Portal'
import { getLatestDigestPreview } from '@/lib/digest/data'
import { formatNumber } from '@/lib/formatNumber'
import type { PortalData } from '@/lib/portal/types'

interface HomepageDataProps {
  data: Promise<PortalData>
}

export async function HomepageStats({ data }: HomepageDataProps) {
  const resolvedData = await data

  if (
    resolvedData.failures.liveAnalytics ||
    resolvedData.failures.memberCount
  ) {
    return <>We preserve public conversations as open source infrastructure.</>
  }

  return (
    <>
      We preserve{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(resolvedData.stats.totalTweets)} public tweets
      </strong>{' '}
      from{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(resolvedData.stats.accountCount)} community members
      </strong>
      .
    </>
  )
}

export async function HomepagePortal({
  data,
  isMember,
}: HomepageDataProps & { isMember: boolean }) {
  const [resolvedData, digestPreview] = await Promise.all([
    data,
    getLatestDigestPreview(),
  ])
  const homepageData: PortalData = isMember
    ? resolvedData
    : {
        ...resolvedData,
        trends: { ...resolvedData.trends, years: [], series: [] },
      }

  return (
    <Portal
      data={homepageData}
      view="home"
      isMember={isMember}
      digestPreview={digestPreview}
      embedded
    />
  )
}

export function HomepagePortalFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading community activity"
      className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="h-7 w-48 rounded bg-zinc-300/80 dark:bg-zinc-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-44 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        ))}
      </div>
    </div>
  )
}
