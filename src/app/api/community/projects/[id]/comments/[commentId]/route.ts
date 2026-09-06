import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Soft-delete a comment. Scoped to the signed-in author, so another member's
 * comment id simply matches no row and reads as not found.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before deleting a comment.' },
      { status: 401 },
    )
  }

  if (!UUID_PATTERN.test(params.id) || !UUID_PATTERN.test(params.commentId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .eq('project_id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: 'We could not delete this comment. Please try again.' },
      { status: 500 },
    )
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
