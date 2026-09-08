import type { Metadata } from 'next'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { getStrands } from '@/lib/community-apps/data'
import { getStrandPage } from '@/lib/community-apps/strand-list'
import { StrandBrowser } from '@/components/strands/StrandBrowser'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = {
  title: 'Strands · Community Archive',
  description:
    'Follow ideas as they evolve across community conversations. Explore curated strands and their source posts.',
  alternates: { canonical: 'https://www.community-archive.org/strands' },
}
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
  const initialPage = await getStrandPage(query, 0)
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-5 py-10 sm:px-7">
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
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [
                'Find a seed post',
                'A post people reference again and again. Quote counts within the community are a useful signal.',
              ],
              [
                'Follow its connections',
                'Gather replies, threads, quote tweets, and the threads around them.',
              ],
              [
                'Search by meaning',
                'Use semantic search to find related posts without explicit links.',
              ],
              [
                'Tell the story',
                'AI reads those posts, writes a narrative, and selects key moments.',
              ],
            ].map(([title, description], i) => (
              <li
                key={title}
                className="flex gap-3 rounded-lg border border-border p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 font-bold text-brand">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-1 leading-5">{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5">
            One experimental approach: similarity isn’t proof of influence.
            Future research agents could check evidence and alternative
            interpretations more thoroughly.
          </p>
        </details>
      </header>
      <StrandBrowser
        initialQuery={query}
        initialPage={initialPage}
        initialCluster={cluster}
        strands={strands.map(
          ({ id, title, username, position, text, mapLabel }) => ({
            id,
            title,
            username,
            position,
            text,
            mapLabel,
            avatar: initialPage.items.find((item) => item.id === id)?.tweet
              ?.avatar,
          }),
        )}
      />
    </main>
  )
}
