import 'server-only'
import { headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { getCurrentUser } from '@/lib/portal/auth'
import { getOptInStatus } from '@/lib/auth-utils'
import { getInitialPortalBangersPage } from '@/lib/portal/data'
import { loadBulletinPage } from '@/lib/bulletin/page'
import { DEFAULT_BULLETIN_FILTERS, type Notice } from '@/lib/bulletin/types'
import { TUBE_DATA_URL, type TubeData, type TubeVideo } from '@/lib/tube'
import type { PortalTweet } from '@/lib/portal/types'

export const HOMEPAGE_TOOL_ITEMS = 3

export async function loadHomepageBangers(): Promise<PortalTweet[]> {
  const page = await getInitialPortalBangersPage({
    scope: 'all',
    sort: 'quotes',
    period: 'week',
  })
  return page.tweets.slice(0, HOMEPAGE_TOOL_ITEMS)
}

const RECENT_TUBE_DAYS = 30

/** Most-shared videos with a share in the last month of the snapshot. */
export function pickHomepageTubeVideos(data: TubeData): TubeVideo[] {
  const since = data.generated - RECENT_TUBE_DAYS * 86400
  return data.videos
    .filter((video) => video.last >= since)
    .sort((left, right) => right.n - left.n)
    .slice(0, HOMEPAGE_TOOL_ITEMS)
}

// The snapshot is a 1.4 MB static file; cache only the three picks.
const cachedTubePicks = unstable_cache(
  async (origin: string) => {
    const response = await fetch(new URL(TUBE_DATA_URL, origin), {
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Tube data returned ${response.status}`)
    return pickHomepageTubeVideos((await response.json()) as TubeData)
  },
  ['homepage-tube-picks'],
  { revalidate: 3600 },
)

export async function loadHomepageTube(): Promise<TubeVideo[]> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  if (!host) return []
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https')
  return cachedTubePicks(`${protocol}://${host}`)
}

/**
 * Mirrors the Bulletin page's consent gate without its redirects, so guests
 * and members who haven't opted in see a teaser instead of leaving the page.
 */
async function canReadBulletin(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user || user.is_anonymous) return false
  const { data: consent, error } = await getOptInStatus(user.id)
  return !error && consent?.opted_in === true && !consent.explicit_optout
}

export async function loadHomepageBulletin(): Promise<Notice[] | null> {
  if (!(await canReadBulletin())) return null
  const page = await loadBulletinPage(
    DEFAULT_BULLETIN_FILTERS,
    undefined,
    false,
  )
  return page.notices.slice(0, HOMEPAGE_TOOL_ITEMS)
}
