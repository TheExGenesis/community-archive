import { Suspense } from 'react'
import { SectionReady } from '@/components/PagePerformance'
import {
  ArchiveOverview,
  DigestHero,
  HomeBangerPanel,
  HomePortalLayout,
  HomeResearchPanel,
  HomeTrendsPanel,
  HomepageLiveStream,
} from '@/components/portal/Portal'
import { getLatestDigestPreview } from '@/lib/digest/data'
import { formatNumber } from '@/lib/formatNumber'
import type { HomepageData } from '@/lib/portal/data'
import { measureServerRead } from '@/lib/performance/server'

export async function HomepageStats({
  data,
}: {
  data: HomepageData['globalStats']
}) {
  const result = await data
  if (result.failed)
    return <>We preserve public conversations as open source infrastructure.</>
  return (
    <>
      <SectionReady section="homepage_stats" />
      We preserve{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(result.data.totalTweets)} public tweets
      </strong>{' '}
      from{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(result.data.memberCount)} community members
      </strong>
      .
    </>
  )
}

export async function HomepageOverview({
  data,
}: {
  data: HomepageData['overview']
}) {
  const { stats, failures } = await data
  const date = new Date(stats.generatedAt)
  const generatedDate = `${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} · ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`
  return (
    <ArchiveOverview
      stats={stats}
      failures={failures}
      generatedDate={generatedDate}
    />
  )
}

export async function HomepageDigest() {
  const preview = await measureServerRead(
    'homepage.digest',
    getLatestDigestPreview,
  ).catch(() => null)
  return (
    <>
      <SectionReady section="homepage_digest" />
      <DigestHero preview={preview} />
    </>
  )
}

export async function HomepageStream({
  data,
}: {
  data: HomepageData['stream']
}) {
  const result = await data
  return (
    <>
      <SectionReady section="homepage_stream" />
      <HomepageLiveStream tweets={result.data} failed={result.failed} />
    </>
  )
}

export async function HomepageBanger({
  data,
  historical = false,
}: {
  data: HomepageData['recentBangers']
  historical?: boolean
}) {
  const result = await data
  return (
    <HomeBangerPanel
      tweet={result.data[0] ?? null}
      failed={result.failed}
      historical={historical}
    />
  )
}

export async function HomepageTrends({
  data,
  isMember,
}: {
  data: HomepageData['trends']
  isMember: boolean
}) {
  const result = await data
  return (
    <HomeTrendsPanel
      weekly={result.data}
      failed={result.failed}
      isMember={isMember}
    />
  )
}

export async function HomepageResearch({
  data,
}: {
  data: HomepageData['research']
}) {
  const result = await data
  return <HomeResearchPanel research={result.data} failed={result.failed} />
}

function SectionLoading({
  label,
  height = 'h-44',
}: {
  label: string
  height?: string
}) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className={`${height} animate-pulse rounded-lg border border-border bg-muted/40`}
    >
      <span className="sr-only">Loading {label}…</span>
    </div>
  )
}

// Each slot owns its await. A boundary around one combined promise would let
// a slow trends query delay even cached stats, stream, and editorial content.
export function HomepagePortal({
  data,
  isMember,
}: {
  data: HomepageData
  isMember: boolean
}) {
  return (
    <HomePortalLayout
      overview={
        <Suspense
          fallback={<SectionLoading label="archive totals" height="h-28" />}
        >
          <HomepageOverview data={data.overview} />
        </Suspense>
      }
      digest={
        <Suspense fallback={<SectionLoading label="daily digest" />}>
          <HomepageDigest />
        </Suspense>
      }
      stream={
        <Suspense
          fallback={<SectionLoading label="live stream" height="h-[420px]" />}
        >
          <HomepageStream data={data.stream} />
        </Suspense>
      }
      bangers={
        <>
          <Suspense fallback={<SectionLoading label="recent banger" />}>
            <HomepageBanger data={data.recentBangers} />
          </Suspense>
          <Suspense fallback={<SectionLoading label="historical banger" />}>
            <HomepageBanger data={data.historicalBangers} historical />
          </Suspense>
        </>
      }
      trends={
        <Suspense fallback={<SectionLoading label="trending terms" />}>
          <HomepageTrends data={data.trends} isMember={isMember} />
        </Suspense>
      }
      research={
        <Suspense fallback={<SectionLoading label="research" />}>
          <HomepageResearch data={data.research} />
        </Suspense>
      }
    />
  )
}
