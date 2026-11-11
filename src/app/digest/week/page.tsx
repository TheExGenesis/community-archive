import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WeeklyDigestView } from '@/components/digest/WeeklyDigestView'
import {
  WeeklyBulletin,
  WeeklyDiscussion,
} from '@/components/digest/WeeklyEngagement'
import { inProgressWeekStart } from '@/lib/digest/currentWeek'
import { WeeklyProfiles } from '@/components/digest/WeeklyProfiles'
import {
  getPublishedWeeklyDigest,
  listPublishedWeeks,
  getCachedWeeklyRefPreviews,
} from '@/lib/digest/weeklyData'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'The Week in Review · Community Archive',
  description:
    "The week's most important and ongoing stories, woven from the Community Archive Daily Digest.",
}

export default async function LatestWeeklyDigestPage() {
  const [edition, weeks, inProgress] = await Promise.all([
    getPublishedWeeklyDigest(),
    listPublishedWeeks(),
    inProgressWeekStart(),
  ])
  if (!edition) notFound()
  const previews = await getCachedWeeklyRefPreviews(edition.weekStart)
  return (
    <WeeklyDigestView
      edition={edition}
      weeks={weeks}
      weekInProgress={inProgress !== null}
      previews={previews}
      profiles={<WeeklyProfiles weekStart={edition.weekStart} />}
      bulletin={<WeeklyBulletin edition={edition} />}
      comments={<WeeklyDiscussion edition={edition} />}
    />
  )
}
