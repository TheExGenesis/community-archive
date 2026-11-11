import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TrendDayView } from '@/components/trending/TrendStoryViews'
import { isTrendDate } from '@/lib/trendStories/core'
import {
  getTrendStoriesForDate,
  getTrendStoryDates,
} from '@/lib/trendStories/data'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>
}): Promise<Metadata> {
  const { date } = await params
  return {
    title: `Trending ${date} · Community Archive`,
    description:
      'What the Community Archive was talking about: trending terms grouped into stories.',
    alternates: { canonical: `/trending/${date}` },
  }
}

export default async function TrendingDayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  if (!isTrendDate(date)) notFound()
  const [stories, dates] = await Promise.all([
    getTrendStoriesForDate(date),
    getTrendStoryDates(),
  ])
  if (!stories.length) notFound()
  return <TrendDayView date={date} dates={dates} stories={stories} />
}
