import { NextResponse } from 'next/server'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// An account id, or a handle: the hover card in Ask the archive knows one or
// the other.
const PROFILE_PATTERN = /^(\d{1,20}|\w{1,15})$/

export interface ProfilePreview {
  accountId: string
  username: string
  displayName: string
  bio: string | null
  location: string | null
  avatar: string | null
  tweets: number | null
  followers: number | null
  hasArchive: boolean
}

/** The few profile facts a hover card shows, for public profiles only. */
export async function GET(
  _request: Request,
  { params }: { params: { account_id: string } },
) {
  if (!PROFILE_PATTERN.test(params.account_id)) {
    return NextResponse.json(
      { error: 'Invalid profile account' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  try {
    const resolved = await resolveProfileCore(params.account_id)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    const { accountId, profile } = resolved
    const preview: ProfilePreview = {
      accountId,
      username: profile.username,
      displayName: profile.account_display_name,
      bio: profile.bio,
      location: profile.location,
      avatar: profile.avatar_media_url,
      tweets: profile.num_tweets,
      followers: profile.num_followers,
      hasArchive: profile.has_archive,
    }
    return NextResponse.json(preview, {
      headers: {
        'Cache-Control':
          'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('Profile preview request failed:', error)
    return NextResponse.json(
      { error: 'Profile preview is temporarily unavailable' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
