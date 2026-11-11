import { notFound, redirect } from 'next/navigation'
import { getTrendStoryDates } from '@/lib/trendStories/data'

// Rendered per request: the build must not depend on the stories table,
// which may not exist yet (or be reachable) where the site is built.
export const dynamic = 'force-dynamic'

export default async function TrendingIndexPage() {
  const latest = await getTrendStoryDates().then(
    (dates) => dates[0],
    () => undefined,
  )
  if (!latest) notFound()
  redirect(`/trending/${latest}`)
}
