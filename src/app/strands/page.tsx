import type { Metadata } from 'next'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { getStrands } from '@/lib/community-apps/data'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import StrandMinimap from '@/components/strands/StrandMinimap'
import TweetCard from '@/components/TweetCard'
import {
  StrandFocusProvider,
  StrandCardFocus,
} from '@/components/strands/StrandFocus'
import { StrandActivity } from '@/components/strands/StrandActivity'
import { STRAND_CLUSTER_NAMES } from '@/lib/community-apps/strand-cluster-names'
import { AnalysisText } from '@/components/community-apps/AnalysisText'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = {
  title: 'Strands · Community Archive',
  description:
    'Follow ideas as they evolve across community conversations. Explore curated strands and their source posts.',
  alternates: { canonical: 'https://www.community-archive.org/strands' },
}
const PAGE_SIZE = 24
export default async function StrandsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; cluster?: string }
}) {
  const { strands, generatedAt } = await getStrands()
  const query =
    typeof searchParams.q === 'string'
      ? searchParams.q.trim().slice(0, 120)
      : ''
  const group =
    typeof searchParams.cluster === 'string' &&
    /^\d+$/.test(searchParams.cluster)
      ? Number(searchParams.cluster)
      : undefined
  const cluster = strands.some((s) => s.position?.cluster === group)
    ? group
    : undefined
  const filtered = strands
    .filter((strand) =>
      `${strand.title} ${strand.summary} ${strand.username}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const requested = Number(searchParams.page)
  const page = Number.isInteger(requested)
    ? Math.max(1, Math.min(pages, requested))
    : 1
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tweets = await getStrandTweets(visible.map((s) => s.id))
  const href = (next: number) =>
    `/strands?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(next) })}`
  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-5 py-10 sm:px-7">
      <Link href="/community" className="text-sm font-semibold text-brand">
        ← Community Apps
      </Link>
      <header className="mb-8 mt-5 max-w-3xl">
        <h1 className="text-4xl font-bold">Strands</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          How can we track stories over time? Explore the spread of an idea, or
          the evolution of a practice or institution, across conversations.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          AI-written summaries with links to the source conversations.
          Collection snapshot: {generatedAt.slice(0, 10)}.
        </p>
        <details className="mt-4 text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer font-semibold text-foreground">
            <Info aria-hidden="true" className="mx-1 inline h-4 w-4" /> How does
            it work?
          </summary>
          <div className="mt-3 space-y-3 leading-6">
            <p>
              A story rarely fits inside a single thread. Strands trace
              connections beyond replies and quote tweets: the building of a
              community like Portal, the documenting of Vibetober, people doing
              a hundred things, or practices like Internal Family Systems (IFS)
              and Alexander Technique.
            </p>
            <p>
              We start with seed tweets: important posts that people reference
              again and again. We gather their available structural connections—
              replies, threads, and quote tweets—then use semantic search to
              find related posts even when there is no explicit link. AI turns
              this collection into a story with a selection of key posts you can
              explore.
            </p>
            <p>
              This is one experimental way to build a strand. Similarity does
              not establish influence, and the archive and summaries can miss
              context. In the future, AI research agents could investigate these
              stories more thoroughly, checking evidence and alternative
              interpretations with greater rigor.
            </p>
          </div>
        </details>
      </header>
      <StrandFocusProvider>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_480px]">
          <div className="min-w-0">
            <form action="/strands" className="mb-6 flex max-w-xl gap-3">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Search strands</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  maxLength={120}
                  placeholder="Search ideas, topics, or people"
                  className="h-11 w-full rounded-lg border border-border bg-background px-4"
                />
              </label>
              <button className="rounded-lg bg-brand px-5 font-semibold text-brand-foreground">
                Search
              </button>
            </form>
            <p className="mb-5 text-sm text-muted-foreground">
              {filtered.length} strands · ordered by the original analysis’s
              rating
            </p>
            <section aria-label="Strands" className="space-y-7">
              {visible.map((strand) => (
                <StrandCardFocus
                  id={strand.id}
                  key={strand.id}
                  className="overflow-hidden border-2 border-foreground/80 bg-card shadow-[3px_3px_0_0_hsl(var(--foreground)/0.15)]"
                >
                  <div className="grid sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="min-w-0 border-b border-border p-4 sm:border-b-0 sm:border-r">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        The seed post
                      </p>
                      {tweets.get(strand.id) ? (
                        <TweetCard
                          tweet={tweets.get(strand.id)!}
                          showDate
                          noClamp
                          clickable={false}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Seed post unavailable.{' '}
                          <Link
                            className="text-brand"
                            href={`/tweets/${strand.id}`}
                          >
                            Open source ↗
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {strand.position && (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: strand.position.color }}
                            />
                            {STRAND_CLUSTER_NAMES[strand.position.cluster]}
                          </span>
                        )}
                        {strand.totalPosts !== undefined && (
                          <span title="Posts included in the original strand snapshot">
                            · {strand.totalPosts.toLocaleString('en-US')} posts
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold leading-tight">
                        <Link
                          href={`/strands/${strand.id}`}
                          className="hover:text-brand"
                        >
                          {strand.title}
                        </Link>
                      </h2>
                      <div className="mt-3 text-sm leading-6">
                        <AnalysisText>
                          {strand.summary.split(/\n\n/)[0]}
                        </AnalysisText>
                      </div>
                      <StrandActivity
                        activity={strand.activity}
                        color={strand.position?.color}
                      />
                      <Link
                        href={`/strands/${strand.id}`}
                        className="mt-4 inline-block text-sm font-semibold text-brand"
                      >
                        Explore the strand →
                      </Link>
                    </div>
                  </div>
                </StrandCardFocus>
              ))}
            </section>
            {!filtered.length && (
              <p className="py-12">
                No strands match this search.{' '}
                <Link className="text-brand" href="/strands">
                  Browse all strands
                </Link>
              </p>
            )}
            {pages > 1 && (
              <nav
                aria-label="Strands pagination"
                className="mt-10 flex items-center justify-between border-t border-border pt-5"
              >
                {page > 1 ? (
                  <Link
                    href={href(page - 1)}
                    className="font-semibold text-brand"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link
                    href={href(page + 1)}
                    className="font-semibold text-brand"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </div>
          <StrandMinimap
            strands={strands.map(
              ({ id, title, username, position, text, mapLabel }) => ({
                id,
                title,
                username,
                position,
                text,
                mapLabel,
              }),
            )}
            initialCluster={cluster}
          />
        </div>
      </StrandFocusProvider>
    </main>
  )
}
