import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { shelfStats } from '@/lib/shelf/bento'
import { getPublicShelf, getPublicShelfImageUrls } from '@/lib/shelf/data'
import {
  ShelfCard,
  cardAvatar,
  cardPicks,
  inlineCovers,
  cardFonts,
  logoDataUrl,
} from '@/lib/shelf/socialCards'
import { shelfOwnerName } from '@/lib/shelf/labels'

export const alt = 'A member shelf on Community Archive'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
// Covers and the avatar are fetched while the card renders.
export const maxDuration = 60

export default async function Image({
  params,
}: {
  params: { account_id: string }
}) {
  const resolved = await resolveProfileCore(params.account_id)
  if (!resolved) notFound()
  const { accountId, profile } = resolved
  const [shelf, urls, logo, fonts] = await Promise.all([
    getPublicShelf(accountId),
    getPublicShelfImageUrls(accountId),
    logoDataUrl(),
    cardFonts(),
  ])
  const picks = cardPicks(shelf, 5, (item) => !!urls[item.workKey])
  const covers = await inlineCovers(
    urls,
    picks.map((item) => item.workKey),
  )
  const stats = shelfStats(shelf)
  const since = stats.find((part) => part.count === null)?.text
  const name =
    shelfOwnerName(profile.account_display_name) ?? `@${profile.username}`
  return new ImageResponse(
    (
      <ShelfCard
        name={name}
        username={profile.username}
        avatar={cardAvatar(profile.avatar_media_url)}
        summary={`${stats[0].count} works tweeted about${since ? ` ${since}` : ''}`}
        picks={picks}
        covers={covers}
        logo={logo}
      />
    ),
    { ...size, fonts },
  )
}
