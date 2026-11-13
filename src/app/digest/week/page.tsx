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
import {
  WeekSoFarProfiles,
  WeeklyProfiles,
} from '@/components/digest/WeeklyProfiles'
import {
  getCachedWeekSoFarRefPreviews,
  getCachedWeeklyRefPreviews,
  getPublishedWeeklyDigest,
  getWeekSoFar,
  listPublishedWeeks,
  type WeeklyDigestEdition,
} from '@/lib/digest/weeklyData'

export const revalidate = 300

/**
 * The running week while it has a week-so-far edition newer than the latest
 * final week; otherwise the latest final week.
 */
async function loadCurrent() {
  const [latest, soFar, weeks] = await Promise.all([
    getPublishedWeeklyDigest(),
    getWeekSoFar(),
    listPublishedWeeks(),
  ])
  const running =
    soFar && (!latest || soFar.weekStart > latest.weekStart) ? soFar : null
  return { latest, running, weeks }
}

export async function generateMetadata(): Promise<Metadata> {
  const { running } = await loadCurrent()
  if (!running) {
    return {
      title: 'The Week in Review · Community Archive',
      description:
        "The week's most important and ongoing stories, woven from the Community Archive Daily Digest.",
    }
  }
  const range = weekRangeLabel(
    running.content.weekStart,
    running.content.weekEnd,
  )
  return {
    title: `The Week So Far, ${range} · Community Archive`,
    description:
      running.content.dek ||
      "This week's stories so far, woven each morning from the Community Archive Daily Digest.",
  }
}

function FinalWeek({
  edition,
  weeks,
  previews,
}: {
  edition: WeeklyDigestEdition
  weeks: string[]
  previews: Awaited<ReturnType<typeof getCachedWeeklyRefPreviews>>
}) {
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

export default async function LatestWeeklyDigestPage() {
  const { latest, running, weeks } = await loadCurrent()
  if (running) {
    const previews = await getCachedWeekSoFarRefPreviews(running)
    // No comments: each morning's edition replaces the last, so a thread on
    // it would disappear overnight.
    return (
      <WeeklyDigestView
        edition={running}
        weeks={weeks}
        previews={previews}
        soFar={{ lastWeek: latest }}
        profiles={<WeekSoFarProfiles edition={running} />}
        bulletin={<WeeklyBulletin edition={running} />}
      />
    )
  }
  if (!latest) notFound()
  const previews = await getCachedWeeklyRefPreviews(latest.weekStart)
  return <FinalWeek edition={latest} weeks={weeks} previews={previews} />
}
