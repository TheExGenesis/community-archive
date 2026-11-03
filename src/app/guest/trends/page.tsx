import GuestTrends from '@/components/portal/GuestTrends'
import {
  getCachedWeeklyTrends,
  loadPortalComponentData,
} from '@/lib/portal/data'

/**
 * The signed-out view of /trends. The middleware rewrites cookie-less
 * document requests here so every visitor shares one cached render. The
 * terms themselves are cached for a day; the short window only bounds how
 * long an upstream failure stays on screen.
 */
export const dynamic = 'force-static'
export const revalidate = 300

export const metadata = { title: 'Trends · Community Archive' }

export default async function GuestTrendsPage() {
  const weekly = await loadPortalComponentData(
    'guest-trends',
    getCachedWeeklyTrends,
    [],
  )
  return <GuestTrends weekly={weekly.data} failed={weekly.failed} />
}
