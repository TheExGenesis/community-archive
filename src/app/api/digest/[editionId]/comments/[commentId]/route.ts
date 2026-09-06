import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import {
  createDigestAdminClient,
  createDigestPublicClient,
} from '@/lib/digest/database'
import { ensurePublishedEdition } from '@/lib/digest/comments'

type Params = { params: { editionId: string; commentId: string } }

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = createDigestPublicClient(cookies())
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const edition = await ensurePublishedEdition(params.editionId)
  if ('error' in edition) return edition.error

  const admin = createDigestAdminClient()
  const { data: comment, error: lookupError } = await admin
    .from('digest_edition_comments')
    .select('id,user_id,deleted_at')
    .eq('id', params.commentId)
    .eq('edition_id', params.editionId)
    .maybeSingle()

  if (lookupError) {
    console.error('Digest comment lookup failed:', lookupError.message)
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
    .from('digest_edition_comments')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', params.commentId)

  if (error) {
    console.error('Digest comment delete failed:', error.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
