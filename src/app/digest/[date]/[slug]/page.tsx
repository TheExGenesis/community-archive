import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DigestStoryView } from '@/components/digest/DigestStoryView'
import { getPublishedDigest } from '@/lib/digest/data'
import { markdownToPlainText } from '@/lib/digest/markdown'
import { loadDigestQuotePosts } from '@/lib/digest/quotePosts'

export const revalidate = 300
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({
  params,
}: {
  params: { date: string; slug: string }
}): Promise<Metadata> {
  if (!DATE_PATTERN.test(params.date))
    return { title: 'What Happened Yesterday · Community Archive' }
  const edition = await getPublishedDigest(params.date)
  const story = edition?.content.stories.find(
    (item) => item.slug === params.slug,
  )
  return story
    ? {
        title: `${markdownToPlainText(story.title)} · Community Archive`,
        description: markdownToPlainText(story.subtitle),
      }
    : { title: 'What Happened Yesterday · Community Archive' }
}

export default async function DigestStoryPage({
  params,
}: {
  params: { date: string; slug: string }
}) {
  if (!DATE_PATTERN.test(params.date)) notFound()
  const edition = await getPublishedDigest(params.date)
  const story = edition?.content.stories.find(
    (item) => item.slug === params.slug,
  )
  if (!edition || !story) notFound()
  const quotePosts = await loadDigestQuotePosts(story.bangers)
  return (
    <DigestStoryView edition={edition} story={story} quotePosts={quotePosts} />
  )
}
