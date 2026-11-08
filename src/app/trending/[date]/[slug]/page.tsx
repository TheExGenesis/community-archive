import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBrowsingUser } from '@/lib/browsingAuth'
import { TrendStoryView } from '@/components/trending/TrendStoryViews'
import { isTrendDate } from '@/lib/trendStories/core'
import {
  getTrendStory,
  getTrendStoryDates,
  getTrendStorySeriesSafe,
} from '@/lib/trendStories/data'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; slug: string }>
}): Promise<Metadata> {
  const { date, slug } = await params
  const story = isTrendDate(date)
    ? (await getTrendStory(date, slug).catch(() => null))?.story
    : null
  if (!story) return { title: 'Trend story · Community Archive' }
  return {
    title: `${story.title} · Trending ${date}`,
    description: story.tooltip,
    alternates: { canonical: `/trending/${date}/${slug}` },
  }
}

export default async function TrendStoryPage({
  params,
}: {
  params: Promise<{ date: string; slug: string }>
}) {
  const { date, slug } = await params
  if (!isTrendDate(date)) notFound()
  const [{ story }, dates, user] = await Promise.all([
    getTrendStory(date, slug),
    getTrendStoryDates(),
    getBrowsingUser(),
  ])
  if (!story) notFound()
  const series = await getTrendStorySeriesSafe(story)
  return (
    <TrendStoryView
      story={story}
      dates={dates}
      canSearch={Boolean(user)}
      series={series}
    />
  )
}
