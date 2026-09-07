import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStrands } from '@/lib/community-apps/data'
import { AnalysisText } from '@/components/community-apps/AnalysisText'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
async function findStrand(seed: string) {
  if (!/^\d{1,20}$/.test(seed)) notFound()
  const { strands } = await getStrands()
  const strand = strands.find((item) => item.id === seed)
  if (!strand) notFound()
  return strand
}
export async function generateMetadata({
  params,
}: {
  params: { seed: string }
}): Promise<Metadata> {
  const strand = await findStrand(params.seed)
  return {
    title: `${strand.title} · Strands · Community Archive`,
    description: strand.summary.slice(0, 160),
    alternates: {
      canonical: `https://www.community-archive.org/strands/${strand.id}`,
    },
  }
}
export default async function StrandPage({
  params,
}: {
  params: { seed: string }
}) {
  const strand = await findStrand(params.seed)
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-7">
      <Link href="/strands" className="text-sm font-semibold text-brand">
        ← All strands
      </Link>
      <article className="mt-6">
        <h1 className="text-4xl font-bold leading-tight">{strand.title}</h1>
        <p className="mb-7 mt-3 text-sm text-muted-foreground">
          An AI-written reading of the conversation. Check the source posts for
          context.
        </p>
        <blockquote className="mb-8 border-l-2 border-brand pl-5">
          <p className="whitespace-pre-wrap leading-7">{strand.text}</p>
          <Link
            href={`/tweets/${strand.id}`}
            className="mt-3 inline-block text-sm font-semibold text-brand"
          >
            Starting post by @{strand.username} ↗
          </Link>
        </blockquote>
        <AnalysisText>{strand.summary}</AnalysisText>
        <section className="mt-10 border-t border-border pt-7">
          <h2 className="mb-5 text-2xl font-bold">Key posts in this strand</h2>
          <ol className="space-y-5">
            {strand.essentialTweets.map((tweet, index) => (
              <li key={tweet.id}>
                <Link
                  href={`/tweets/${tweet.id}`}
                  className="font-semibold text-brand"
                >
                  {index + 1}. Read source post ↗
                </Link>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {tweet.annotation}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </main>
  )
}
