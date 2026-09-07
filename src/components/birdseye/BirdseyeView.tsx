import Link from 'next/link'
import { Link2 } from 'lucide-react'
import type { BirdseyeAnalysis } from '@/lib/community-apps/types'
import { AnalysisText } from '@/components/community-apps/AnalysisText'
import { TopicSparkline } from './TopicSparkline'
import { SourcePosts } from './SourcePosts'
import { ShareBirdseye } from './ShareBirdseye'

export function BirdseyeView({
  analysis,
  selectedId,
  isOwner,
  sharingEnabled,
}: {
  analysis: BirdseyeAnalysis
  selectedId?: string
  isOwner: boolean
  sharingEnabled: boolean
}) {
  const selected =
    analysis.clusters.find((cluster) => cluster.id === selectedId) ??
    analysis.clusters[0]
  const dates = analysis.clusters.flatMap((cluster) =>
    cluster.years.map((p) => p.year),
  )
  const start = dates.length ? Math.min(...dates) : 0
  const end = dates.length ? Math.max(...dates) : 0
  const groupedIds = new Set(
    analysis.groups.flatMap((group) => group.clusterIds),
  )
  const groups = [
    ...analysis.groups,
    {
      name: 'More topics',
      clusterIds: analysis.clusters
        .filter((c) => !groupedIds.has(c.id))
        .map((c) => c.id),
    },
  ]
  const clusters = new Map(
    analysis.clusters.map((cluster) => [cluster.id, cluster]),
  )
  return (
    <main className="ph-no-capture ph-mask mx-auto min-h-screen max-w-[1440px] px-5 py-8 sm:px-8">
      <Link
        href="/community"
        className="text-xs font-semibold text-muted-foreground hover:text-brand"
      >
        ← Community Apps
      </Link>
      <header className="mb-9 mt-6 flex flex-wrap items-start justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Birdseye · Experimental
          </p>
          <h1 className="break-all text-4xl font-bold tracking-tight sm:text-5xl">
            <Link href={`/user/${analysis.username}`}>
              @{analysis.username}
            </Link>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            An archive in {analysis.clusters.length} topics. Ideas, interests,
            and connections over time.
          </p>
        </div>
        {isOwner ? (
          <ShareBirdseye initiallyEnabled={sharingEnabled} />
        ) : (
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            Shared with you
          </span>
        )}
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[330px_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="Archive topics"
          className="max-h-56 space-y-6 overflow-y-auto pr-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]"
        >
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{analysis.clusters.length} TOPICS</span>
            <span>
              Cited posts · {start}–{end}
            </span>
          </div>
          {groups.map((group) => {
            const members = group.clusterIds.flatMap((id) =>
              clusters.has(id) ? [clusters.get(id)!] : [],
            )
            return members.length ? (
              <section key={group.name}>
                <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h2>
                <ul className="space-y-1">
                  {members.map((cluster) => (
                    <li key={cluster.id}>
                      <Link
                        prefetch={false}
                        href={`/birdseye?username=${analysis.username}&cluster_id=${encodeURIComponent(cluster.id)}`}
                        aria-current={
                          selected?.id === cluster.id ? 'page' : undefined
                        }
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition-colors ${selected?.id === cluster.id ? 'border-brand/20 bg-brand/10 font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted'}`}
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
            ) : null
          })}
        </nav>
        {selected ? (
          <article className="min-w-0 space-y-8">
            <section>
              <p className="mb-3 text-xs text-muted-foreground">
                TOPIC / {Array.from(new Set(selected.tweetIds)).length} CITED
                POSTS
              </p>
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {selected.name}
              </h2>
              <AnalysisText>{selected.summary}</AnalysisText>
            </section>
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
              AI-generated from a saved archive snapshot. Interpretations may be
              mistaken. Charts count cited posts, not every tweet.
            </p>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {selected.sections
                .filter((section) => section.items.length)
                .map((section) => (
                  <section
                    key={section.name}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-bold">
                      {section.name}
                      <span className="font-normal text-muted-foreground">
                        {section.items.length}
                      </span>
                    </h3>
                    <div className="divide-y divide-border/60">
                      {section.items.map((item, index) => (
                        <div
                          key={`${item.label}:${index}`}
                          className="py-3 first:pt-0 last:pb-0"
                        >
                          <h4 className="text-sm font-semibold">
                            {item.label}
                          </h4>
                          {item.description && (
                            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Array.from(new Set(item.tweetIds)).map(
                              (id, sourceIndex) => (
                                <Link
                                  prefetch={false}
                                  key={id}
                                  href={`/tweets/${id}`}
                                  aria-label={`Source ${sourceIndex + 1} for ${item.label}`}
                                  title={`View source post ${sourceIndex + 1}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-brand hover:bg-brand/10"
                                >
                                  <Link2 size={13} aria-hidden="true" />
                                </Link>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
            <SourcePosts
              key={`${analysis.username}:${selected.id}`}
              username={analysis.username}
              clusterId={selected.id}
              total={Array.from(new Set(selected.tweetIds)).length}
            />
          </article>
        ) : (
          <p>No topics are currently available for this archive.</p>
        )}
      </div>
    </main>
  )
}
