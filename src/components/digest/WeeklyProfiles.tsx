import { Suspense } from 'react'
import { getCachedWeeklyProfiles } from '@/lib/digest/weeklyData'
import { WeeklyProfilePrimer } from './WeeklyProfilePrimer'

async function Profiles({
  weekStart,
  storySlug,
}: {
  weekStart: string
  storySlug?: string
}) {
  const profiles = await getCachedWeeklyProfiles(weekStart, storySlug).catch(
    () => [],
  )
  return <WeeklyProfilePrimer profiles={profiles} />
}

/** Profile hover-card facts, streamed after the stories so they never wait. */
export function WeeklyProfiles(props: {
  weekStart: string
  storySlug?: string
}) {
  return (
    <Suspense fallback={null}>
      <Profiles {...props} />
    </Suspense>
  )
}
