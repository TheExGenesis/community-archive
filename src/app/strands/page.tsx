import type { Metadata } from 'next'
import Link from 'next/link'
import { getStrands } from '@/lib/community-apps/data'

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
  searchParams: { q?: string; page?: string }
}) {
  const { strands, generatedAt } = await getStrands()
  const query =
    typeof searchParams.q === 'string'
      ? searchParams.q.trim().slice(0, 120)
      : ''
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
  const href = (next: number) =>
    `/strands?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(next) })}`
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 sm:px-7">
      <Link href="/community" className="text-sm font-semibold text-brand">
        ← Community Apps
      </Link>
      <header className="mb-8 mt-5 max-w-3xl">
        <h1 className="text-4xl font-bold">Strands</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Ideas that took on a life of their own. Follow how a thought develops
          across people, replies, and years.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          AI-written summaries with links to the source conversations.
          Collection snapshot: {generatedAt.slice(0, 10)}.
        </p>
      </header>
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
        {filtered.length} strands · ordered by the original analysis’s rating
      </p>
      <section
        aria-label="Strands"
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {filtered
          .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
          .map((strand) => (
            <article key={strand.id} className="border-t border-border pt-5">
              <Link href={`/strands/${strand.id}`} className="group">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Starting with @{strand.username}
                </p>
                <h2 className="text-2xl font-bold leading-tight group-hover:text-brand">
                  {strand.title}
                </h2>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                  {strand.summary}
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-brand">
                  Read the strand →
                </span>
              </Link>
            </article>
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
            <Link href={href(page - 1)} className="font-semibold text-brand">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="font-semibold text-brand">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  )
}
