import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  WeeklyDigestView,
  weekRangeLabel,
} from '@/components/digest/WeeklyDigestView'
import {
  WeeklyBulletin,
  WeeklyDiscussion,
} from '@/components/digest/WeeklyEngagement'
import { WeeklyProfiles } from '@/components/digest/WeeklyProfiles'
import {
  getPublishedWeeklyDigest,
  listPublishedWeeks,
  getCachedWeeklyRefPreviews,
} from '@/lib/digest/weeklyData'

export const revalidate = 300

// No weeks are built ahead of time; each is rendered on its first visit and
// then served from the cache, refreshed every five minutes.
export async function generateStaticParams() {
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ weekStart: string }>
}): Promise<Metadata> {
  const { weekStart } = await params
  const edition = await getPublishedWeeklyDigest(weekStart)
  if (!edition) return { title: 'Weekly Digest · Community Archive' }
  const range = weekRangeLabel(
    edition.content.weekStart,
    edition.content.weekEnd,
  )
  return {
    title: `The Week in Review, ${range} · Community Archive`,
    description: edition.content.dek || edition.content.executiveSummary[0],
    alternates: { canonical: `/digest/week/${edition.weekStart}` },
    openGraph: {
      type: 'article',
      title: `The Week in Review, ${range}`,
      description: edition.content.dek || edition.content.executiveSummary[0],
    },
  }
}

export default async function WeeklyDigestPage({
  params,
}: {
  params: Promise<{ weekStart: string }>
}) {
  const { weekStart } = await params
  const [edition, weeks] = await Promise.all([
    getPublishedWeeklyDigest(weekStart),
    listPublishedWeeks(),
  ])
  if (!edition) notFound()
  const previews = await getCachedWeeklyRefPreviews(edition.weekStart)
  return (
    <WeeklyDigestView
      edition={edition}
      weeks={weeks}
      previews={previews}
      profiles={<WeeklyProfiles weekStart={edition.weekStart} />}
      bulletin={<WeeklyBulletin edition={edition} />}
      comments={<WeeklyDiscussion edition={edition} />}
    />
  )
}
