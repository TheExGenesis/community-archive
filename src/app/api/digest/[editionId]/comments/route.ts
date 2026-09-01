import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  createDigestAdminClient,
  createDigestPublicClient,
} from '@/lib/digest/database'
import {
  ensurePublishedEdition,
  mapDigestComment,
  MAX_COMMENT_LENGTH,
  resolveCommenterIdentity,
} from '@/lib/digest/comments'

type Params = { params: { editionId: string } }

const viewerId = async () => {
  const supabase = createDigestPublicClient(cookies())
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error ? null : (user ?? null)
}

export async function GET(_request: Request, { params }: Params) {
  const edition = await ensurePublishedEdition(params.editionId)
  if ('error' in edition) return edition.error

  const user = await viewerId()
  const admin = createDigestAdminClient()
  const { data, error } = await admin
    .from('digest_edition_comments')
    .select('*')
    .eq('edition_id', params.editionId)
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

export async function POST(request: Request, { params }: Params) {
  const user = await viewerId()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const edition = await ensurePublishedEdition(params.editionId)
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
  const admin = createDigestAdminClient()
  const { data, error } = await admin
    .from('digest_edition_comments')
    .insert({
      edition_id: params.editionId,
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
