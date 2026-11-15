import { Suspense, type ReactNode } from 'react'
import { toTrendStoryLink, trendDateForTerms } from '@/lib/trendStories/core'
import { getTrendStoriesForDateSafe } from '@/lib/trendStories/data'
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
        {formatNumber(result.data.totalTweets, 'floor')} public tweets
      </strong>{' '}
      from{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(result.data.memberCount, 'floor')} community members
      </strong>
      .
    </>
  )
}

export type GrowthCounterPlacement =
  | 'top-left'
  | 'top-right'
  | 'subline'
  | 'trends'

const GROWTH_PLACEMENT_CLASS: Record<GrowthCounterPlacement, string> = {
  // The corners sit in the hero's top padding; below sm the title needs it.
  'top-left': 'absolute left-4 top-3 hidden sm:inline-flex sm:left-6',
  'top-right': 'absolute right-4 top-3 hidden sm:inline-flex sm:right-6',
  subline: 'inline-flex',
  // Half-width panel header: below lg it would push the title onto two lines.
  trends: 'hidden lg:inline-flex',
}

/**
 * New tweets and members in the last 24 hours, from the same cached summary
 * as the hero line. Renders nothing when the gateway omits both deltas, so an
 * older gateway or a failed read never shows an invented zero.
 */
export async function HomepageGrowthCounter({
  data,
  placement,
}: {
  data: HomepageData['globalStats']
  placement: GrowthCounterPlacement
}) {
  const result = await data
  if (result.failed) return null
  const tweets = result.data.addedLast24Hours
  const members = result.data.membersAddedLast24Hours ?? null
  if (tweets == null && members == null) return null
  const compact = placement === 'trends'
  const count = (n: number) =>
    compact ? formatNumber(n) : n.toLocaleString('en-US')
  const parts = [
    tweets != null ? `+${count(tweets)} tweet${tweets === 1 ? '' : 's'}` : null,
    members != null
      ? `+${count(members)} member${members === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)
  return (
    <span
      data-growth-counter={placement}
      title="Added to the archive in the last 24 hours"
      className={`${GROWTH_PLACEMENT_CLASS[placement]} items-center gap-[7px] whitespace-nowrap ${
        compact
          ? 'text-[11.5px] font-normal text-muted-foreground'
          : 'rounded-full border border-border bg-background/70 px-2.5 py-1 text-[12px] text-muted-foreground backdrop-blur'
      }`}
    >
      <span
        aria-hidden
        className="h-[7px] w-[7px] flex-shrink-0 animate-pulse rounded-full bg-[#2acf80]"
      />
      <span className="tabular-nums">
        <span className="font-semibold text-[#16a34a] dark:text-[#2acf80]">
          {parts.join(' · ')}
        </span>{' '}
        in 24h
      </span>
    </span>
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
  titleAside,
}: {
  data: HomepageData['trends']
  isMember: boolean
  titleAside?: ReactNode
}) {
  const result = await data
  const stories = result.failed
    ? []
    : await getTrendStoriesForDateSafe(trendDateForTerms(result.data))
  return (
    <HomeTrendsPanel
      weekly={result.data}
      failed={result.failed}
      isMember={isMember}
      stories={stories.map(toTrendStoryLink)}
      titleAside={titleAside}
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
          <HomepageTrends
            data={data.trends}
            isMember={isMember}
            titleAside={
              <Suspense fallback={null}>
                <HomepageGrowthCounter
                  data={data.globalStats}
                  placement="trends"
                />
              </Suspense>
            }
          />
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
