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
  prebuiltWeeklyParams,
} from '@/lib/digest/weeklyData'
import { WeeklyProfiles } from '@/components/digest/WeeklyProfiles'

export const revalidate = 300

// Stories of the newest weeks are rendered during the build; the rest on their
// first visit. Either way they are then served from the cache, refreshed every
// five minutes.
export async function generateStaticParams() {
  return (await prebuiltWeeklyParams()).flatMap(({ weekStart, slugs }) =>
    slugs.map((slug) => ({ weekStart, slug })),
  )
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
