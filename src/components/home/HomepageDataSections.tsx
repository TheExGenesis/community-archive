import { Suspense } from 'react'
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
import { loadHomepageBulletinItems } from '@/lib/bulletin/homepage'
import { getCurrentUser } from '@/lib/portal/auth'
import { HomeBulletinPanel } from './HomeBulletinPanel'

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

/**
 * New tweets and members in the last 24 hours, pinned to the hero's top-left
 * corner. Reads the same cached summary as the hero line. Renders nothing when
 * the gateway omits both deltas, so a failed read never shows an invented zero.
 * A zero member delta is dropped. Centred above the title below sm.
 */
export async function HomepageGrowthCounter({
  data,
}: {
  data: HomepageData['globalStats']
}) {
  const result = await data
  if (result.failed) return null
  const tweets = result.data.addedLast24Hours
  const members = result.data.membersAddedLast24Hours || null
  if (tweets == null && members == null) return null
  const parts = [
    tweets != null
      ? `+${tweets.toLocaleString('en-US')} tweet${tweets === 1 ? '' : 's'}`
      : null,
    members != null
      ? `+${members.toLocaleString('en-US')} member${members === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)
  return (
    <span
      title="Added to the archive in the last 24 hours"
      className="absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-[7px] whitespace-nowrap rounded-full border border-border bg-background/70 px-2.5 py-1 text-[12px] text-muted-foreground backdrop-blur sm:left-6 sm:translate-x-0"
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

/**
 * Bulletin offers and asks below the digest. Signed-in readers get picks
 * ranked by who they interact with, minus notices they dismissed; the cached
 * signed-out render gets the shared ranking. Renders nothing on failure.
 */
export async function HomepageBulletin({ isMember }: { isMember: boolean }) {
  const user = isMember ? await getCurrentUser().catch(() => null) : null
  const providerId = user?.app_metadata?.provider_id
  const accountId =
    typeof providerId === 'string' && /^\d{1,20}$/.test(providerId)
      ? providerId
      : null
  const items = await measureServerRead('homepage.bulletin', () =>
    loadHomepageBulletinItems({
      accountId,
      userId: user && !user.is_anonymous ? user.id : null,
    }),
  ).catch(() => [])
  if (!items.length) return null
  return (
    <>
      <SectionReady section="homepage_bulletin" />
      <HomeBulletinPanel items={items} personalized={accountId !== null} />
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
  const stories = result.failed
    ? []
    : await getTrendStoriesForDateSafe(trendDateForTerms(result.data))
  return (
    <HomeTrendsPanel
      weekly={result.data}
      failed={result.failed}
      isMember={isMember}
      stories={stories.map(toTrendStoryLink)}
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
      bulletin={
        <Suspense fallback={null}>
          <HomepageBulletin isMember={isMember} />
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
