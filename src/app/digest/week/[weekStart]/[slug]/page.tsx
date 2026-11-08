import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  WeeklyStoryView,
  weekRangeLabel,
  weeklyStoryPath,
} from '@/components/digest/WeeklyDigestView'
import {
  getPublishedWeeklyDigest,
  getCachedWeeklyRefPreviews,
} from '@/lib/digest/weeklyData'
import { WeeklyProfiles } from '@/components/digest/WeeklyProfiles'

export const revalidate = 300

// No weeks are built ahead of time; each is rendered on its first visit and
// then served from the cache, refreshed every five minutes.
export async function generateStaticParams() {
  return []
}

const plain = (text: string) => text.replace(/[*_`[\]]/g, '')

async function load(weekStart: string, slug: string) {
  const edition = await getPublishedWeeklyDigest(weekStart)
  const story = edition?.content.stories.find((item) => item.slug === slug)
  return edition && story ? { edition, story } : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ weekStart: string; slug: string }>
}): Promise<Metadata> {
  const { weekStart, slug } = await params
  const found = await load(weekStart, slug)
  if (!found) return { title: 'Weekly Digest · Community Archive' }
  const { edition, story } = found
  const range = weekRangeLabel(
    edition.content.weekStart,
    edition.content.weekEnd,
  )
  const title = plain(story.title)
  return {
    title: `${title} · The Week in Review, ${range}`,
    description: plain(story.overview),
    alternates: { canonical: weeklyStoryPath(edition.weekStart, story.slug) },
    openGraph: { type: 'article', title, description: plain(story.overview) },
  }
}

export default async function WeeklyStoryPage({
  params,
}: {
  params: Promise<{ weekStart: string; slug: string }>
}) {
  const { weekStart, slug } = await params
  const found = await load(weekStart, slug)
  if (!found) notFound()
  const { edition, story } = found
  const previews = await getCachedWeeklyRefPreviews(edition.weekStart)
  return (
    <WeeklyStoryView
      edition={edition}
      story={story}
      previews={previews}
      profiles={
        <WeeklyProfiles weekStart={edition.weekStart} storySlug={story.slug} />
      }
    />
  )
}
