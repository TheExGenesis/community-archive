import { browsingAuthError } from '@/lib/browsingAuth'
import { NextRequest, NextResponse } from 'next/server'
import {
  PROFILE_TIMELINE_MAX_OFFSET,
  type ProfileTimelineKind,
} from '@/lib/metaTwitter/profilePagination'
import { fetchProfileTimelinePage } from '@/lib/metaTwitter/profileTimeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

const profileJson = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })

/** Signed-in only, like the rest of the member profile. */
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ account_id: string }> },
) {
  const params = await paramsPromise
  const authError = await browsingAuthError()
  if (authError) return authError

  const search = request.nextUrl.searchParams
  const offsetValue = search.get('offset') ?? '0'
  const offset = /^\d{1,6}$/.test(offsetValue) ? Number(offsetValue) : -1
  const kindValue = search.get('kind') ?? 'original'
  if (
    !ACCOUNT_ID_PATTERN.test(params.account_id) ||
    offset < 0 ||
    offset > PROFILE_TIMELINE_MAX_OFFSET ||
    (kindValue !== 'original' && kindValue !== 'all')
  ) {
    return profileJson({ error: 'Invalid profile timeline request' }, 400)
  }

  try {
    return profileJson(
      await fetchProfileTimelinePage(params.account_id, {
        offset,
        kind: kindValue as ProfileTimelineKind,
      }),
    )
  } catch (error) {
    console.error('Profile timeline request failed:', error)
    return profileJson(
      { error: 'Latest posts are temporarily unavailable' },
      502,
    )
  }
}
