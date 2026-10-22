import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import {
  getPublicShelf,
  getPublicShelfImageUrls,
  getShelfPeople,
} from '@/lib/shelf/data'
import { shelfOwnerName, shelfWorkKeyPrefix } from '@/lib/shelf/labels'
import {
  WorkCard,
  cardFonts,
  inlineCovers,
  logoDataUrl,
} from '@/lib/shelf/socialCards'

export const alt = 'A work on a member shelf on Community Archive'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
export const maxDuration = 60

/** The member's newest tweet about the work, as plain text for the card. */
async function quoteFor(accountId: string, tweetIds: string[]) {
  const newest = [...tweetIds].sort(
    (a, b) => b.length - a.length || b.localeCompare(a),
  )[0]
  if (!newest) return null
  const tweet = await fetchClickHouseTweetPageData(newest).catch(() => null)
  if (!tweet || tweet.account_id !== accountId) return null
  const text = tweet.full_text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(?:@\w+\s+)+/, '')
    .replace(/&amp;/g, '&')
    .trim()
  return text || null
}

export default async function Image({
  params,
}: {
  params: { account_id: string; work: string }
}) {
  const resolved = await resolveProfileCore(params.account_id)
  if (!resolved) notFound()
  const { accountId, profile } = resolved
  const prefix = shelfWorkKeyPrefix(decodeURIComponent(params.work))
  const shelf = await getPublicShelf(accountId)
  const item = prefix
    ? shelf.rows
        .flatMap((row) => row.items)
        .find((i) => i.key.startsWith(prefix))
    : undefined
  if (!item) notFound()
  const [urls, logo, fonts, quote, people] = await Promise.all([
    getPublicShelfImageUrls(accountId),
    logoDataUrl(),
    cardFonts(),
    quoteFor(accountId, item.evidenceTweetIds),
    getShelfPeople(accountId, item.echoAccountIds.slice(0, 5)).catch(() => []),
  ])
  const covers = await inlineCovers(urls, [item.workKey])
  const name =
    shelfOwnerName(profile.account_display_name) ?? `@${profile.username}`
  return new ImageResponse(
    (
      <WorkCard
        item={item}
        cover={covers[item.workKey]}
        name={name}
        username={profile.username}
        quote={quote}
        people={people}
        logo={logo}
      />
    ),
    { ...size, fonts },
  )
}
