import { NextResponse } from 'next/server'
import { createDigestAdminClient } from '@/lib/digest/database'
import { resolveCommentThread } from '@/lib/digest/comments'

export const dynamic = 'force-dynamic'

/** Count one visit to a week and return the week's total. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ editionId: string }> },
) {
  const resolved = await resolveCommentThread(
    (await params).editionId,
    'weekly',
  )
  if ('error' in resolved) return resolved.error
  const weekStart = resolved.thread.weekStart
  if (!weekStart) {
    return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
  }

  const { data, error } = await createDigestAdminClient().rpc(
    'record_digest_weekly_view',
    { p_week_start: weekStart },
  )
  if (error) {
    console.error('Weekly digest view increment failed:', error.message)
    return NextResponse.json({ error: 'View unavailable' }, { status: 500 })
  }
  if (typeof data !== 'number') {
    return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
  }
  return NextResponse.json(
    { count: data },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
