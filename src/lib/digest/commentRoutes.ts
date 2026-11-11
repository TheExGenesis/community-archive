import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import {
  createDigestAdminClient,
  createDigestPublicClient,
} from '@/lib/digest/database'
import {
  DIGEST_COMMENT_TABLES,
  ensurePublishedEdition,
  mapDigestComment,
  MAX_COMMENT_LENGTH,
  resolveCommenterIdentity,
  type DigestCommentKind,
} from '@/lib/digest/comments'

type EditionParams = { params: Promise<{ editionId: string }> }
type CommentParams = {
  params: Promise<{ editionId: string; commentId: string }>
}

const viewer = async () => {
  const supabase = createDigestPublicClient(await cookies())
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error ? null : (user ?? null)
}

/**
 * Comment list and create handlers for a daily or weekly edition. Writes go
 * through the service-role client after the session is verified; the edition
 * must be published.
 */
export function digestCommentHandlers(kind: DigestCommentKind) {
  const table = DIGEST_COMMENT_TABLES[kind].comments

  async function GET(_request: Request, { params }: EditionParams) {
    const { editionId } = await params
    const edition = await ensurePublishedEdition(editionId, kind)
    if ('error' in edition) return edition.error

    const user = await viewer()
    const { data, error } = await createDigestAdminClient()
      .from(table)
      .select('*')
      .eq('edition_id', editionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Digest comment list failed:', error.message)
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
    }

    const comments = (data ?? []).map((row) =>
      mapDigestComment(row, user?.id ?? null),
    )
    return NextResponse.json({
      comments,
      count: comments.length,
      signedIn: Boolean(user),
    })
  }

  async function POST(request: Request, { params }: EditionParams) {
    const { editionId } = await params
    const user = await viewer()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const edition = await ensurePublishedEdition(editionId, kind)
    if ('error' in edition) return edition.error

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const raw = (body as { content?: unknown } | null)?.content
    const content = typeof raw === 'string' ? raw.trim() : ''
    if (!content || content.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `Comment must be 1-${MAX_COMMENT_LENGTH} characters` },
        { status: 400 },
      )
    }

    const { username, displayName } = resolveCommenterIdentity(user)
    const { data, error } = await createDigestAdminClient()
      .from(table)
      .insert({
        edition_id: editionId,
        user_id: user.id,
        content,
        username,
        display_name: displayName,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('Digest comment insert failed:', error?.message)
      return NextResponse.json({ error: 'Comment failed' }, { status: 500 })
    }

    return NextResponse.json(
      { comment: mapDigestComment(data, user.id) },
      { status: 201 },
    )
  }

  return { GET, POST }
}

/** Soft-delete handler: the author or an admin may remove a comment. */
export function digestCommentDeleteHandler(kind: DigestCommentKind) {
  const table = DIGEST_COMMENT_TABLES[kind].comments

  return async function DELETE(_request: Request, { params }: CommentParams) {
    const { editionId, commentId } = await params
    const user = await viewer()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const edition = await ensurePublishedEdition(editionId, kind)
    if ('error' in edition) return edition.error

    const admin = createDigestAdminClient()
    const { data: comment, error: lookupError } = await admin
      .from(table)
      .select('id,user_id,deleted_at')
      .eq('id', commentId)
      .eq('edition_id', editionId)
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
      .from(table)
      .update({ deleted_at: now, updated_at: now })
      .eq('id', commentId)

    if (error) {
      console.error('Digest comment delete failed:', error.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })
  }
}
