import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CurrentWeekView } from '@/components/digest/CurrentWeekView'
import { getCurrentWeek } from '@/lib/digest/currentWeek'
import { CURRENT_WEEK_PATH } from '@/lib/digest/weekly'
import { listPublishedWeeks } from '@/lib/digest/weeklyData'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'The Week So Far · Community Archive',
  description:
    "This week's Community Archive Daily Digest stories, gathered day by day until the Week in Review is published.",
  alternates: { canonical: CURRENT_WEEK_PATH },
}

export default async function CurrentWeekPage() {
  const [week, weeks] = await Promise.all([
    getCurrentWeek(),
    listPublishedWeeks(1),
  ])
  // Once the week's own edition is out (or before any daily exists), the
  // finished Week in Review is the page to read.
  if (!week) redirect('/digest/week')
  return <CurrentWeekView week={week} previousWeek={weeks[0] ?? null} />
}
