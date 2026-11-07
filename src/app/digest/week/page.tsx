import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WeeklyDigestView } from '@/components/digest/WeeklyDigestView'
import {
  getPublishedWeeklyDigest,
  listPublishedWeeks,
  loadWeeklyRefPreviews,
} from '@/lib/digest/weeklyData'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'The Week in Review · Community Archive',
  description:
    "The week's most important and ongoing stories, woven from the Community Archive Daily Digest.",
}

export default async function LatestWeeklyDigestPage() {
  const [edition, weeks] = await Promise.all([
    getPublishedWeeklyDigest(),
    listPublishedWeeks(),
  ])
  if (!edition) notFound()
  const previews = await loadWeeklyRefPreviews(edition.content)
  return (
    <WeeklyDigestView edition={edition} weeks={weeks} previews={previews} />
  )
}
