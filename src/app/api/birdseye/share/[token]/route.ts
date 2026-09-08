import { NextRequest, NextResponse } from 'next/server'
import {
  PRIVATE_HEADERS,
  resolveBirdseyeShare,
  SHARE_COOKIE,
} from '@/lib/community-apps/birdseye-access'
export const dynamic = 'force-dynamic'
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const identity = await resolveBirdseyeShare(params.token)
  if (!identity)
    return new NextResponse(
      'This share link is unavailable or has been revoked.',
      { status: 404, headers: PRIVATE_HEADERS },
    )
  // Redirect before rendering any page or analytics, so the bearer secret is
  // never included in topic links, page referrers, or client component props.
  const response = NextResponse.redirect(
    new URL(`/birdseye?username=${identity.username}`, request.url),
    { status: 303, headers: PRIVATE_HEADERS },
  )
  response.cookies.set(SHARE_COOKIE, params.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 86400,
  })
  return response
}
