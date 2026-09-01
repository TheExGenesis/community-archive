import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

export const MAX_COMMENT_LENGTH = 2000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CommentRow = {
  id: string
  user_id: string
  content: string
  username: string | null
  display_name: string | null
  created_at: string
}

const COMMENT_SELECT =
  'id, user_id, content, username, display_name, created_at'

/**
 * The commenter's display name, taken from the same trusted OAuth identity
 * data the username comes from. user_metadata is user-mutable, so it is only a
 * last resort and never overrides the identity value.
 */
function sessionDisplayName(user: User): string | null {
  const identity =
    user.identities?.find((item) =>
      ['twitter', 'x'].includes(item.provider ?? ''),
    ) ?? null
  const sources = [
    (identity?.identity_data ?? {}) as Record<string, unknown>,
    (user.user_metadata ?? {}) as Record<string, unknown>,
  ]

  for (const source of sources) {
    for (const key of ['full_name', 'name']) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return null
}

async function publishedProjectId(id: string) {
  if (!UUID_PATTERN.test(id)) return null

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  const project = data as { id: string; status: string } | null
  if (error || !project || project.status !== 'published') return null
  return project.id
}

function serializeComment(row: CommentRow, viewerId: string | null) {
  return {
    id: row.id,
    content: row.content,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    isOwn: Boolean(viewerId) && row.user_id === viewerId,
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const projectId = await publishedProjectId(params.id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const user = await getCurrentUser()
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_comments')
    .select(COMMENT_SELECT)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: 'We could not load comments. Please try again.' },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as unknown as CommentRow[]
  return NextResponse.json({
    comments: rows.map((row) => serializeComment(row, user?.id ?? null)),
  })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before commenting on a project.' },
      { status: 401 },
    )
  }

  const projectId = await publishedProjectId(params.id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const rawContent = (body as { content?: unknown } | null)?.content
  const content = typeof rawContent === 'string' ? rawContent.trim() : ''
  if (!content) {
    return NextResponse.json(
      { error: 'Write a comment before posting.' },
      { status: 400 },
    )
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` },
      { status: 400 },
    )
  }

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_comments')
    .insert({
      project_id: projectId,
      user_id: user.id,
      content,
      username: getSessionTwitterUsername(user),
      display_name: sessionDisplayName(user),
    })
    .select(COMMENT_SELECT)
    .maybeSingle()

  const row = data as unknown as CommentRow | null
  if (error || !row) {
    return NextResponse.json(
      { error: 'We could not save this comment. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { comment: serializeComment(row, user.id) },
    { status: 201 },
  )
}
