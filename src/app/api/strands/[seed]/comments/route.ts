import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  MAX_COMMENT_LENGTH,
  resolveCommenterIdentity,
} from '@/lib/digest/comments'
import {
  createStrandAdminClient,
  ensureVisibleStrand,
  mapStrandComment,
} from '@/lib/community-apps/strand-engagement'

export const dynamic = 'force-dynamic'

type Params = { params: { seed: string } }

export async function GET(_request: Request, { params }: Params) {
  const strand = await ensureVisibleStrand(params.seed)
  if ('error' in strand) return strand.error

  const user = await getCurrentUser()
  const { data, error } = await createStrandAdminClient()
    .from('strand_comments')
    .select('*')
    .eq('strand_id', params.seed)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Strand comment list failed:', error.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  const comments = (data ?? []).map((row) =>
    mapStrandComment(row, user?.id ?? null),
  )
  return NextResponse.json(
    { comments, count: comments.length, signedIn: Boolean(user) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const strand = await ensureVisibleStrand(params.seed)
  if ('error' in strand) return strand.error

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
  const { data, error } = await createStrandAdminClient()
    .from('strand_comments')
    .insert({
      strand_id: params.seed,
      user_id: user.id,
      content,
      username,
      display_name: displayName,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('Strand comment insert failed:', error?.message)
    return NextResponse.json({ error: 'Comment failed' }, { status: 500 })
  }

  return NextResponse.json(
    { comment: mapStrandComment(data, user.id) },
    { status: 201 },
  )
}
