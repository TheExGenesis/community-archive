import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  createStrandAdminClient,
  STRAND_SEED_PATTERN,
} from '@/lib/community-apps/strand-engagement'

export const dynamic = 'force-dynamic'

type Params = { params: { seed: string; commentId: string } }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Authors can remove their own comment even after a strand is hidden, so this
// deliberately skips the visibility check the other strand routes make.
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (
    !STRAND_SEED_PATTERN.test(params.seed) ||
    !UUID_PATTERN.test(params.commentId)
  ) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  const admin = createStrandAdminClient()
  const { data: comment, error: lookupError } = await admin
    .from('strand_comments')
    .select('id,user_id,deleted_at')
    .eq('id', params.commentId)
    .eq('strand_id', params.seed)
    .maybeSingle()

  if (lookupError) {
    console.error('Strand comment lookup failed:', lookupError.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
  if (!comment || comment.deleted_at) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }
  if (comment.user_id !== user.id && !isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('strand_comments')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', params.commentId)

  if (error) {
    console.error('Strand comment delete failed:', error.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
