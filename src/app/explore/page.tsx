import { redirect } from 'next/navigation'
import MemberSearchLanding from '@/components/MemberSearchLanding'
import { getOptInStatus, requireAuth } from '@/lib/auth-utils'
import { getStats } from '@/lib/stats'

export const metadata = {
  title: 'Explore the archive | Community Archive',
  description: 'Search millions of public conversations in Community Archive.',
}

export default async function ExplorePage() {
  const { user, supabase } = await requireAuth('/explore')
  const { data: optInData } = await getOptInStatus(user.id)

  if (!optInData?.opted_in) {
    redirect('/opt-in')
  }

  const stats = await getStats(supabase).catch((error) => {
    console.error('Unable to load archive stats for member search:', error)
    return { tweetCount: null, userCount: null }
  })

  return (
    <MemberSearchLanding
      tweetCount={stats.tweetCount}
      userCount={stats.userCount}
    />
  )
}
