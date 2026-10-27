import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DigestArchivedQuotePosts } from '@/components/digest/DigestArchivedQuotePosts'
import { measureServerRead } from '@/lib/performance/server'
import type { DigestEdition, DigestStory } from '@/lib/digest/types'
import { notFound } from 'next/navigation'
import { DigestStoryView } from '@/components/digest/DigestStoryView'
import { getPublishedDigest } from '@/lib/digest/data'
import { getDigestStoryMetadata } from '@/lib/digest/metadata'
import { loadDigestQuotePosts } from '@/lib/digest/quotePosts'

export const revalidate = 300
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; slug: string }>
}): Promise<Metadata> {
  const { date, slug } = await params
  const pathname = `/digest/${date}/${slug}`
  if (!DATE_PATTERN.test(date))
    return getDigestStoryMetadata(null, undefined, pathname)
  const edition = await getPublishedDigest(date)
  return getDigestStoryMetadata(
    edition,
    edition?.content.stories.find((item) => item.slug === slug),
    pathname,
  )
}

export default async function DigestStoryPage({
  params,
}: {
  params: Promise<{ date: string; slug: string }>
}) {
  const { date, slug } = await params
  if (!DATE_PATTERN.test(date)) notFound()
  const edition = await getPublishedDigest(date)
  const story = edition?.content.stories.find(
    (item) => item.slug === slug,
  )
  if (!edition || !story) notFound()
  return (
    <DigestStoryView
      edition={edition}
      story={story}
      archivedQuotes={
        <Suspense fallback={<p role="status">Loading archived quote posts…</p>}>
          <ArchivedQuotes edition={edition} story={story} />
        </Suspense>
      }
    />
  )
}

async function ArchivedQuotes({
  edition,
  story,
}: {
  edition: DigestEdition
  story: DigestStory
}) {
  const quotePosts = await measureServerRead('digest.quote-posts', () =>
    loadDigestQuotePosts(story.bangers),
  )
  return (
    <DigestArchivedQuotePosts
      edition={edition}
      story={story}
      quotePosts={quotePosts}
    />
  )
}
