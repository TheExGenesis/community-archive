import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type LikeRow = { user_id: string }

async function likeCount(projectId: string) {
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_likes')
    .select('user_id')
    .eq('project_id', projectId)

  if (error) return 0
  return ((data ?? []) as unknown as LikeRow[]).length
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

async function toggleLike(
  request: Request,
  params: { id: string },
  liked: boolean,
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before liking a project.' },
      { status: 401 },
    )
  }

  const projectId = await publishedProjectId(params.id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createServerServiceRoleClient()
  const { error } = liked
    ? await admin
        .from('community_project_likes')
        .upsert(
          { project_id: projectId, user_id: user.id },
          { onConflict: 'project_id,user_id', ignoreDuplicates: true },
        )
    : await admin
        .from('community_project_likes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'We could not save this like. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ liked, count: await likeCount(projectId) })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  return toggleLike(request, params, true)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  return toggleLike(request, params, false)
}
