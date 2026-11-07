import { notFound, redirect } from 'next/navigation'
import { getTrendStoryDates } from '@/lib/trendStories/data'

export const revalidate = 300

export default async function TrendingIndexPage() {
  const [latest] = await getTrendStoryDates()
  if (!latest) notFound()
  redirect(`/trending/${latest}`)
}
