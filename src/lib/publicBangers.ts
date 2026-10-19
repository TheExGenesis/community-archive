import 'server-only'

import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getCuratedProfileBangersPage } from '@/lib/profileCuration'
import { bangerPortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import { getPortalBangersPage } from '@/lib/portal/data'
import type { PortalBangersPeriod } from '@/lib/portal/types'

export async function getPublicBangersPage(input: {
  username?: string
  query?: string
  period?: PortalBangersPeriod | 'all'
  limit: number
  offset: number
}) {
  if (input.username) {
    const profile = await resolveProfileCore(input.username)
    if (!profile)
      return {
        tweets: [],
        nextOffset: null,
        accountId: null,
        href: `/user/${encodeURIComponent(input.username)}`,
      }
    const page = await getCuratedProfileBangersPage(profile.accountId, {
      limit: input.limit,
      offset: input.offset,
      sort: 'quotes',
    })
    if (!page.available) throw new Error('Profile bangers are unavailable')
    return {
      tweets: page.tweets.map((tweet) => bangerPortalTweet(tweet)),
      nextOffset: page.nextOffset,
      accountId: profile.accountId,
      href: `/user/${profile.accountId}`,
    }
  }
  const page = await getPortalBangersPage({
    limit: input.limit,
    offset: input.offset,
    query: input.query,
    period: input.period === 'all' ? undefined : (input.period ?? 'week'),
    scope: 'all',
    sort: 'quotes',
  })
  return { ...page, nextOffset: page.pagination.nextOffset, href: '/bangers' }
}
