import { Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { SectionReady } from '@/components/PagePerformance'
import {
  HomepageBanger,
  HomepageStream,
  HomepageTrends,
} from '@/components/home/HomepageDataSections'
import {
  DigestBrief,
  LatestResearch,
  MemberLinks,
  YouCard,
} from '@/components/home/MemberPanels'
import { PanelHeader } from '@/components/portal/Portal'
import { CARD } from '@/components/portal/styles'
import { DigestBulletinCards } from '@/components/digest/DigestBulletinCards'
import { loadDigestBulletinItemsForViewer } from '@/lib/digest/bulletin'
import { getPublishedDigest } from '@/lib/digest/data'
import { isArchiveStale, loadMemberHomeState } from '@/lib/memberHome'
import type { MemberHomepageData } from '@/lib/portal/data'

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

async function MemberDigest({ data }: { data: MemberHomepageData['digest'] }) {
  const result = await data
  return (
    <>
      <SectionReady section="homepage_digest" />
      <DigestBrief preview={result.data} />
    </>
  )
}

async function MemberResearch({
  data,
}: {
  data: MemberHomepageData['latestResearch']
}) {
  const result = await data
  return <LatestResearch post={result.data} />
}

async function MemberYou({ user }: { user: User | null }) {
  const state = await loadMemberHomeState(user)
  return (
    <YouCard
      {...state}
      archiveStale={
        state.archive?.phase === 'completed' &&
        isArchiveStale(state.archive.archiveAt)
      }
    />
  )
}

/**
 * Asks and offers from the latest edition's window, ranked for the viewer the
 * same way the digest page ranks them. Hidden when there is nothing to show.
 */
async function BulletinForYou() {
  try {
    const edition = await getPublishedDigest()
    if (!edition || edition.isPreview) return null
    const { items, personalized } =
      await loadDigestBulletinItemsForViewer(edition)
    if (items.length === 0) return null
    return (
      <div className={`${CARD} flex flex-col`}>
        <PanelHeader
          title={personalized ? 'Bulletin · for you' : 'New in the Bulletin'}
          action={{
            label: 'Open the Bulletin',
            href: '/bulletin',
            analyticsDestination: 'bulletin',
          }}
        />
        <div className="px-4 pb-4 [&>div]:mt-4">
          <DigestBulletinCards items={items} />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Member home bulletin selection failed:', error)
    return null
  }
}

/**
 * The signed-in homepage. Visitors get the pitch in ClassicHomepage; members
 * get what changed since yesterday and their own archive, with no pitch.
 */
export default function MemberHomepage({
  data,
  user,
}: {
  data: MemberHomepageData
  user: User | null
}) {
  return (
    <main className="bg-zinc-100/80 dark:bg-transparent">
      <h1 className="sr-only">Community Archive</h1>
      {/*
        Two independent columns so neither waits on the other's height. On
        phones the columns dissolve (display: contents) and `order` keeps the
        reading order: digest, trends, you, then the rest.
      */}
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-1">
            <Suspense fallback={<SectionLoading label="daily digest" />}>
              <MemberDigest data={data.digest} />
            </Suspense>
          </div>
          <div className="order-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Suspense fallback={<SectionLoading label="historical banger" />}>
              <HomepageBanger data={data.historicalBangers} historical />
            </Suspense>
            <Suspense fallback={<SectionLoading label="recent banger" />}>
              <HomepageBanger data={data.recentBangers} />
            </Suspense>
          </div>
          <div className="order-5 empty:hidden">
            <Suspense fallback={<SectionLoading label="bulletin picks" />}>
              <BulletinForYou />
            </Suspense>
          </div>
          <div className="order-6 min-w-0">
            <Suspense
              fallback={
                <SectionLoading label="live stream" height="h-[420px]" />
              }
            >
              <HomepageStream data={data.stream} />
            </Suspense>
          </div>
        </div>

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-2">
            <Suspense fallback={<SectionLoading label="trending terms" />}>
              <HomepageTrends data={data.trends} isMember />
            </Suspense>
          </div>
          <div className="order-3">
            <Suspense fallback={<SectionLoading label="your archive" />}>
              <MemberYou user={user} />
            </Suspense>
          </div>
          <div className="order-7">
            <Suspense
              fallback={<SectionLoading label="research" height="h-28" />}
            >
              <MemberResearch data={data.latestResearch} />
            </Suspense>
          </div>
          <div className="order-8">
            <MemberLinks />
          </div>
        </div>
      </div>
    </main>
  )
}
