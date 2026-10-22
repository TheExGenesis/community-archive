import { Suspense } from 'react'
import { SectionReady } from '@/components/PagePerformance'
import {
  DigestHero,
  HomepageHighlightsLayout,
  HomeResearchPanel,
  HomeTrendsPanel,
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
// a slow trends query delay cached stats or editorial content.
export function HomepagePortal({
  data,
  isMember,
}: {
  data: HomepageData
  isMember: boolean
}) {
  return (
    <HomepageHighlightsLayout
      digest={
        <Suspense fallback={<SectionLoading label="daily digest" />}>
          <HomepageDigest />
        </Suspense>
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
