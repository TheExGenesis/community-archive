import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getStrands } from '@/lib/community-apps/data'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import StrandMinimap from '@/components/strands/StrandMinimap'
import StrandTimeline from '@/components/strands/StrandTimeline'
import { StrandEntry } from '@/components/strands/StrandEntry'
import TweetCard from '@/components/TweetCard'
import { AnalysisText } from '@/components/community-apps/AnalysisText'
import {
  StrandComments,
  StrandLikeButton,
} from '@/components/strands/StrandEngagement'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  getStrandCommentCount,
  getStrandLikeCount,
  getStrandLikedByViewer,
} from '@/lib/community-apps/strand-engagement'

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
async function Likes({ strandId }: { strandId: string }) {
  const user = await getCurrentUser()
  const [count, liked] = await Promise.all([
    getStrandLikeCount(strandId),
    user ? getStrandLikedByViewer(strandId, user.id) : false,
  ])
  return (
    <StrandLikeButton
      strandId={strandId}
      initialCount={count}
      initialLiked={liked}
      isSignedIn={Boolean(user)}
    />
  )
}
async function Comments({ strandId }: { strandId: string }) {
  const [count, user] = await Promise.all([
    getStrandCommentCount(strandId),
    getCurrentUser(),
  ])
  return (
    <StrandComments
      strandId={strandId}
      initialCount={count}
      isSignedIn={Boolean(user)}
    />
  )
}
export default async function StrandPage({
  params,
}: {
  params: { seed: string }
}) {
  const strand = await findStrand(params.seed)
  const [{ strands }, tweets] = await Promise.all([
    getStrands(),
    getStrandTweets([strand.id, ...strand.essentialTweets.map((p) => p.id)]),
  ])
  const refs = new Map(strand.essentialTweets.map((p) => [p.id, p]))
  if (!refs.has(strand.id))
    refs.set(strand.id, {
      id: strand.id,
      annotation: 'The seed post around which this strand was assembled.',
    })
  const posts = Array.from(refs.values()).map((p) => ({
    ...p,
    tweet: tweets.get(p.id),
  }))
  return (
    <main
      id="strand-top"
      className="mx-auto w-[max(70%,min(100%,1000px))] scroll-mt-20 px-5 py-10 sm:px-7"
    >
      <StrandEntry seedId={strand.id} />
      <a href="/strands" className="text-sm font-semibold text-brand">
        ← All strands
      </a>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.93fr)_minmax(0,1fr)]">
        <article className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-4xl font-bold leading-tight">{strand.title}</h1>
            <div className="mt-1.5 shrink-0">
              <Suspense
                fallback={
                  <span
                    aria-label="Loading likes"
                    className="inline-block h-8 w-14 animate-pulse rounded-full bg-muted"
                  />
                }
              >
                <Likes strandId={strand.id} />
              </Suspense>
            </div>
          </div>
          <div className="mb-8 mt-7 border-2 border-foreground/80 bg-card p-5 shadow-[3px_3px_0_0_hsl(var(--brand))]">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              The seed post · where this strand begins
            </p>
            {tweets.get(strand.id) ? (
              <TweetCard
                tweet={tweets.get(strand.id)!}
                noClamp
                showDate
                clickable={false}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Seed post unavailable.{' '}
                <Link href={`/tweets/${strand.id}`} className="text-brand">
                  Open source ↗
                </Link>
              </p>
            )}
          </div>
          <section className="mt-12 border-t border-border pt-7">
            <h2 className="mb-5 text-2xl font-bold">
              The story of this strand
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              An AI-written reading of the conversation. Check the source posts
              for context.
            </p>
            <AnalysisText className="text-foreground">
              {strand.summary}
            </AnalysisText>
          </section>
          <StrandTimeline
            posts={posts}
            seedId={strand.id}
            color={strand.position?.color}
          />
          <Suspense fallback={<p role="status">Loading discussion…</p>}>
            <Comments strandId={strand.id} />
          </Suspense>
        </article>
        <StrandMinimap
          strands={strands.map(
            ({ id, title, username, position, text, mapLabel }) => ({
              id,
              title,
              username,
              position,
              text,
              mapLabel,
              avatar: tweets.get(id)?.avatar,
            }),
          )}
          activeId={strand.id}
          className="order-none"
        />
      </div>
    </main>
  )
}
