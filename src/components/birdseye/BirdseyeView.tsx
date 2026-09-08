import Link from 'next/link'
import { Suspense } from 'react'
import { ProfileIdentity } from './ProfileIdentity'
import { TopicSummary } from './TopicSummary'
import type {
  BirdseyeAnalysis,
  BirdseyeCluster,
} from '@/lib/community-apps/types'
import {
  birdseyeGroups,
  monthlyActivity,
} from '@/lib/community-apps/birdseye-layout'
import { getBirdseyeSourceIndex } from '@/lib/community-apps/birdseye-source-index'
import { getBirdseyeSamples } from '@/lib/community-apps/birdseye-samples'
import { TopicSparkline } from './TopicSparkline'
import { MonthlyTimeline } from './MonthlyTimeline'
import { SampleTweets } from './SampleTweets'
import { InsightCards } from './InsightCards'
import { SourcePosts } from './SourcePosts'
import { ShareBirdseye } from './ShareBirdseye'

async function TopicContent({
  cluster,
  username,
}: {
  cluster: BirdseyeCluster
  username: string
}) {
  let samples: Awaited<ReturnType<typeof getBirdseyeSamples>> = []
  let sampleError = false
  let sourceTotal = new Set(cluster.tweetIds).size
  try {
    const index = await getBirdseyeSourceIndex(cluster.tweetIds, username)
    sourceTotal = index.length
    samples = await getBirdseyeSamples(
      index.map(({ id }) => id),
      username,
    )
  } catch {
    sampleError = true
  }
  return (
    <>
      <SampleTweets tweets={samples} username={username} />
      {sampleError && (
        <p className="text-xs text-muted-foreground">
          Sample selection is temporarily unavailable. Source posts below can
          still be loaded.
        </p>
      )}
      <MonthlyTimeline cluster={cluster} />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading insights…</p>
        }
      >
        <InsightCards cluster={cluster} />
      </Suspense>
      <SourcePosts
        key={`${username}:${cluster.id}`}
        username={username}
        clusterId={cluster.id}
        total={sourceTotal - samples.length}
        excludeIds={samples.map((tweet) => tweet.id)}
      />
    </>
  )
}

export function BirdseyeView({
  analysis,
  selectedId,
  isOwner,
  sharingEnabled,
  isAdmin = false,
}: {
  analysis: BirdseyeAnalysis
  selectedId?: string
  isOwner: boolean
  sharingEnabled: boolean
  isAdmin?: boolean
}) {
  const selected = analysis.clusters.find(
    (cluster) => cluster.id === selectedId,
  )
  const groups = birdseyeGroups(analysis)
  const ids = Array.from(
    new Set(analysis.clusters.flatMap((cluster) => cluster.tweetIds)),
  )
  const months = monthlyActivity(ids)
  const start = months.length ? Number(months[0].month.slice(0, 4)) : 0
  const end = months.length
    ? Number(months[months.length - 1].month.slice(0, 4))
    : 0
  const overviewHref = `/birdseye?username=${analysis.username}`
  const topicHref = (cluster: BirdseyeCluster) =>
    `${overviewHref}&cluster_id=${encodeURIComponent(cluster.id)}`
  return (
    <main className="ph-no-capture ph-mask mx-auto min-h-screen max-w-[1440px] px-5 py-3 sm:px-8">
      <div className="flex items-center justify-between gap-3 text-xs">
        <Link
          href="/community"
          className="font-semibold text-muted-foreground hover:text-brand"
        >
          ← Community Apps
        </Link>
        {isAdmin && (
          <Link href="/birdseye/profiles" className="font-semibold text-brand">
            Change profile →
          </Link>
        )}
      </div>
      <header className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
            Birdseye · Experimental
          </p>
          <Suspense
            fallback={
              <h1 className="font-sans text-xl font-bold">
                @{analysis.username}
              </h1>
            }
          >
            <ProfileIdentity username={analysis.username} />
          </Suspense>
        </div>
        {isOwner ? (
          <ShareBirdseye initiallyEnabled={sharingEnabled} />
        ) : (
          <span className="rounded-full bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            {isAdmin ? 'Admin view' : 'Shared with you'}
          </span>
        )}
      </header>
      <div className="grid items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-7">
        <nav
          aria-label="Archive topics"
          className="birdseye-scroll max-h-20 space-y-5 overflow-y-auto pr-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]"
        >
          <Link
            href={overviewHref}
            aria-current={!selected ? 'page' : undefined}
            className={`block rounded-lg px-2 py-2 font-sans text-base font-bold ${!selected ? 'bg-brand/10 text-brand' : 'hover:bg-muted/50'}`}
          >
            Overview{' '}
            <span className="float-right text-xs font-normal">
              {analysis.clusters.length} topics
            </span>
          </Link>
          {groups.map((group) => (
            <section key={group.id}>
              <h2 className="mb-2 px-2 font-sans text-lg font-bold leading-snug">
                <Link
                  href={`${overviewHref}#${group.id}`}
                  className="hover:text-brand"
                >
                  {group.name}
                </Link>
              </h2>
              <ul className="space-y-0.5">
                {group.topics.map((cluster) => (
                  <li key={cluster.id}>
                    <Link
                      prefetch={false}
                      href={topicHref(cluster)}
                      aria-current={
                        selected?.id === cluster.id ? 'page' : undefined
                      }
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-[13px] ${selected?.id === cluster.id ? 'bg-brand/10 font-semibold text-brand' : 'text-muted-foreground hover:bg-muted/40'}`}
                    >
                      <span className="min-w-0">{cluster.name}</span>
                      <TopicSparkline
                        years={cluster.years}
                        start={start}
                        end={end}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        {selected ? (
          <article className="min-w-0 space-y-4">
            <div>
              <h2 className="font-sans text-xl font-bold leading-tight sm:text-2xl">
                {selected.name}
              </h2>
              <TopicSummary key={selected.id} text={selected.summary} />
            </div>
            <Suspense
              key={selected.id}
              fallback={
                <section
                  aria-label="Loading sample tweets"
                  className="grid gap-3 md:grid-cols-3"
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-52 animate-pulse rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground"
                    >
                      Loading sample posts…
                    </div>
                  ))}
                </section>
              }
            >
              <TopicContent cluster={selected} username={analysis.username} />
            </Suspense>
          </article>
        ) : (
          <article className="min-w-0 space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
                The big picture
              </p>
              <h2 className="font-sans text-3xl font-bold">
                @{analysis.username}’s topics, at a glance
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {groups.length} big themes across {analysis.clusters.length}{' '}
                topics and {ids.length.toLocaleString()} cited posts
                {start ? `, ${start}–${end}` : ''}. Start with a theme or choose
                a subtopic.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Based on saved analyses, ordered by cited-post count. This is a
                snapshot, not a live profile.
              </p>
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {groups.map((group) => (
                <section
                  id={group.id}
                  key={group.id}
                  className="scroll-mt-20 rounded-2xl border border-border bg-card/60 p-5"
                >
                  <div className="mb-4">
                    <h3 className="font-sans text-xl font-bold leading-snug">
                      {group.name}
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {group.topics.length} subtopics ·{' '}
                      {group.tweetIds.length.toLocaleString()} cited posts
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {group.topics.map((cluster) => (
                      <li key={cluster.id}>
                        <Link
                          prefetch={false}
                          href={topicHref(cluster)}
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-brand/5"
                        >
                          <span>{cluster.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Set(cluster.tweetIds).size} ↗
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>
        )}
      </div>
    </main>
  )
}
