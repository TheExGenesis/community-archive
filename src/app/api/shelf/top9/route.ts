import { createElement } from 'react'
import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getPublicShelf, getPublicShelfImageUrls } from '@/lib/shelf/data'
import {
  Top9Card,
  cardAvatar,
  cardFonts,
  cardPicks,
  inlineCovers,
  logoDataUrl,
} from '@/lib/shelf/socialCards'
import { shelfOwnerName } from '@/lib/shelf/labels'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * A 1080×1080 image of the nine works a member came back to most, offered
 * as a download from the shelf's Share menu. Approved works only.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id') ?? ''
  if (!/^\d{1,20}$/.test(accountId))
    return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
  const resolved = await resolveProfileCore(accountId)
  if (!resolved)
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  const { profile } = resolved
  try {
    const [shelf, urls, logo, fonts] = await Promise.all([
      getPublicShelf(accountId),
      getPublicShelfImageUrls(accountId),
      logoDataUrl(),
      cardFonts(),
    ])
    if (!shelf.total)
      return NextResponse.json(
        { error: 'Nothing on this shelf yet' },
        { status: 404 },
      )
    const picks = cardPicks(shelf, 9, (item) => !!urls[item.workKey])
    const covers = await inlineCovers(
      urls,
      picks.map((item) => item.workKey),
    )
    const name =
      shelfOwnerName(profile.account_display_name) ?? `@${profile.username}`
    return new ImageResponse(
      createElement(Top9Card, {
        name,
        username: profile.username,
        avatar: cardAvatar(profile.avatar_media_url, true),
        picks,
        covers,
        logo,
      }),
      {
        width: 1080,
        height: 1080,
        fonts,
        headers: {
          'Content-Disposition': `attachment; filename="${profile.username}-top-9.png"`,
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      },
    )
  } catch {
    return NextResponse.json(
      { error: 'The image could not be made. Try again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
