import type { Metadata } from 'next'
import type { BirdseyeCluster } from '@/lib/community-apps/types'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getBirdseyeAnalysis,
  getBirdseyeCatalog,
} from '@/lib/community-apps/data'
import {
  AnalysisText,
  EvidenceLinks,
} from '@/components/community-apps/AnalysisText'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = {
  title: 'Birdseye · Community Archive',
  description:
    'Explore the topics, ideas, and recurring themes in a person’s archived tweets.',
  alternates: { canonical: 'https://www.community-archive.org/birdseye' },
}
export default async function BirdseyePage({
  searchParams,
}: {
  searchParams: { username?: string; cluster_id?: string }
}) {
  const { accounts, manifest, policy } = await getBirdseyeCatalog()
  const username =
    typeof searchParams.username === 'string'
      ? searchParams.username.toLowerCase()
      : ''
  if (username && !accounts.some((account) => account.username === username))
    notFound()
  const analysis = username
    ? await getBirdseyeAnalysis(username, manifest, policy.blocked)
    : null
  const requestedCluster =
    typeof searchParams.cluster_id === 'string' ? searchParams.cluster_id : ''
  const selected =
    analysis?.clusters.find((cluster) => cluster.id === requestedCluster) ??
    analysis?.clusters[0]
  const clusters = new Map(
    analysis?.clusters.map((cluster) => [cluster.id, cluster]) ?? [],
  )
  const groupedIds = new Set(
    analysis?.groups.flatMap((group) => group.clusterIds) ?? [],
  )
  const groups = analysis
    ? [
        ...analysis.groups,
        {
          name: 'More topics',
          clusterIds: analysis.clusters
            .filter((cluster) => !groupedIds.has(cluster.id))
            .map((cluster) => cluster.id),
        },
      ]
    : []
  return (
    <main className="mx-auto min-h-screen max-w-[1280px] px-5 py-10 sm:px-7">
      <Link href="/community" className="text-sm font-semibold text-brand">
        ← Community Apps
      </Link>
      <header className="mb-8 mt-5 max-w-3xl">
        <h1 className="text-4xl font-bold">Birdseye</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          A view of an archive by topic, with the ideas and conversations that
          connect it.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore saved AI analyses and follow the source posts. These describe
          an archive snapshot, and may contain mistakes.
        </p>
      </header>
      <form
        action="/birdseye"
        className="mb-8 flex max-w-lg flex-wrap items-end gap-3"
      >
        <label className="min-w-0 flex-1 text-sm font-semibold">
          Choose an archive
          <select
            name="username"
            defaultValue={username}
            required
            className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
          >
            <option value="" disabled>
              Select a person
            </option>
            {accounts.map((account) => (
              <option key={account.username} value={account.username}>
                @{account.username}
              </option>
            ))}
          </select>
        </label>
        <button className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground">
          Explore
        </button>
      </form>
      {!analysis ? (
        <section
          aria-label="Available analyses"
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {accounts.map((account) => (
            <Link
              key={account.username}
              href={`/birdseye?username=${account.username}`}
              className="rounded-lg border border-border p-4 font-semibold hover:border-brand"
            >
              @{account.username}{' '}
              <span className="float-right text-brand">↗</span>
            </Link>
          ))}
          {!accounts.length && <p>No analyses are currently available.</p>}
        </section>
      ) : (
        <div className="grid items-start gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
          <nav
            aria-label="Archive topics"
            className="max-h-64 space-y-6 overflow-y-auto pr-3 md:max-h-[75vh]"
          >
            <Link
              href={`/user/${username}`}
              className="text-lg font-semibold text-brand"
            >
              @{username} ↗
            </Link>
            {groups.map((group) => {
              const members = group.clusterIds
                .map((id) => clusters.get(id))
                .filter(
                  (cluster): cluster is BirdseyeCluster =>
                    cluster !== undefined,
                )
              return members.length ? (
                <section key={group.name}>
                  <h2 className="mb-2 text-lg font-bold">{group.name}</h2>
                  <ul className="space-y-1">
                    {members.map((cluster) => (
                      <li key={cluster.id}>
                        <Link
                          href={`/birdseye?username=${username}&cluster_id=${encodeURIComponent(cluster.id)}`}
                          aria-current={
                            selected?.id === cluster.id ? 'page' : undefined
                          }
                          className={`block rounded-lg px-3 py-2 text-sm ${selected?.id === cluster.id ? 'bg-brand/10 font-semibold text-brand' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          {cluster.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null
            })}
          </nav>
          {selected ? (
            <article className="min-w-0 space-y-7">
              <div>
                <h2 className="mb-3 text-3xl font-bold">{selected.name}</h2>
                <AnalysisText>{selected.summary}</AnalysisText>
              </div>
              {selected.years.length > 0 && (
                <section>
                  <h3 className="mb-3 text-lg font-bold">
                    Referenced posts over time
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {selected.years.map(({ year, count }) => (
                      <div
                        key={year}
                        className="rounded-lg bg-muted px-3 py-2 text-center"
                      >
                        <div className="text-xs text-muted-foreground">
                          {year}
                        </div>
                        <div className="font-semibold">{count}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Counts cover the analysis’s cited posts, not every tweet in
                    the archive.
                  </p>
                </section>
              )}
              {selected.sections.map((section) => (
                <section key={section.name}>
                  <h3 className="mb-3 text-xl font-bold">{section.name}</h3>
                  <div className="space-y-4">
                    {section.items.map((item, index) => (
                      <div
                        key={`${item.label}:${index}`}
                        className="border-l-2 border-brand/25 pl-4"
                      >
                        <h4 className="font-semibold">{item.label}</h4>
                        {item.description && (
                          <p className="my-1 text-sm leading-6 text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        <EvidenceLinks ids={item.tweetIds} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <details className="rounded-lg border border-border p-4">
                <summary className="cursor-pointer font-semibold">
                  All {selected.tweetIds.length} source posts
                </summary>
                <div className="mt-4">
                  <EvidenceLinks ids={selected.tweetIds} />
                </div>
              </details>
            </article>
          ) : (
            <p>No topics are currently available for this archive.</p>
          )}
        </div>
      )}
    </main>
  )
}
