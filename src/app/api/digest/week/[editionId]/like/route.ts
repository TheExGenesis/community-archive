import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  createDigestAdminClient,
  createDigestPublicClient,
} from '@/lib/digest/database'
import { resolveCommentThread } from '@/lib/digest/comments'

type Params = { params: Promise<{ editionId: string }> }

// A like belongs to the week, so it survives each morning's week-so-far
// edition and carries into the final one (see the migration).
async function resolveWeek(editionId: string) {
  const resolved = await resolveCommentThread(editionId, 'weekly')
  if ('error' in resolved) return resolved
  const weekStart = resolved.thread.weekStart
  if (!weekStart) {
    return {
      error: NextResponse.json({ error: 'Edition not found' }, { status: 404 }),
    }
  }
  return { weekStart }
}

const viewer = async () => {
  const {
    data: { user },
    error,
  } = await createDigestPublicClient(await cookies()).auth.getUser()
  return error ? null : (user ?? null)
}

async function likeCount(weekStart: string) {
  const { count, error } = await createDigestAdminClient()
    .from('digest_weekly_likes')
    .select('id', { count: 'exact', head: true })
    .eq('week_start', weekStart)
  if (error) throw new Error(error.message)
  return count ?? 0
}

const failed = (message: string, error: unknown) => {
  console.error(message, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: 'Like unavailable' }, { status: 500 })
}

/**
 * Viewer-specific like state for a week. The week pages are cached and shared
 * between sessions, so the button hydrates its signed-in state from here.
 */
export async function GET(_request: Request, { params }: Params) {
  const week = await resolveWeek((await params).editionId)
  if ('error' in week) return week.error
  const user = await viewer()
  try {
    let liked = false
    if (user) {
      const { data, error } = await createDigestAdminClient()
        .from('digest_weekly_likes')
        .select('id')
        .eq('week_start', week.weekStart)
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      liked = Boolean(data)
    }
    return NextResponse.json(
      {
        liked,
        signedIn: Boolean(user),
        count: await likeCount(week.weekStart),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return failed('Weekly digest like read failed:', error)
  }
}

export async function POST(_request: Request, { params }: Params) {
  const user = await viewer()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const week = await resolveWeek((await params).editionId)
  if ('error' in week) return week.error

  const { error } = await createDigestAdminClient()
    .from('digest_weekly_likes')
    .upsert(
      { week_start: week.weekStart, user_id: user.id },
      { onConflict: 'week_start,user_id', ignoreDuplicates: true },
    )
  if (error) return failed('Weekly digest like insert failed:', error.message)
  try {
    return NextResponse.json({
      liked: true,
      count: await likeCount(week.weekStart),
    })
  } catch (countError) {
    return failed('Weekly digest like count failed:', countError)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await viewer()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const week = await resolveWeek((await params).editionId)
  if ('error' in week) return week.error

  const { error } = await createDigestAdminClient()
    .from('digest_weekly_likes')
    .delete()
    .eq('week_start', week.weekStart)
    .eq('user_id', user.id)
  if (error) return failed('Weekly digest unlike failed:', error.message)
  try {
    return NextResponse.json({
      liked: false,
      count: await likeCount(week.weekStart),
    })
  } catch (countError) {
    return failed('Weekly digest like count failed:', countError)
  }
}
