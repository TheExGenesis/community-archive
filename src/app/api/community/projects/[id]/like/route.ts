import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { COMMUNITY_PROJECTS } from '@/lib/communityProjects'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function likeCount(slug: string) {
  const admin = createServerServiceRoleClient()
  const { count, error } = await admin
    .from('community_project_likes')
    .select('id', { count: 'exact', head: true })
    .eq('project_slug', slug)

  if (error) return 0
  return count ?? 0
}

async function resolveProject(id: string) {
  const isUuid = UUID_PATTERN.test(id)
  if (!isUuid && !SLUG_PATTERN.test(id)) return null

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .select('id, slug, status')
    .eq(isUuid ? 'id' : 'slug', id)
    .maybeSingle()

  const project = data as { id: string; slug: string; status: string } | null
  if (!error && project?.status === 'published') {
    return { slug: project.slug, projectId: project.id }
  }
  if (!isUuid && COMMUNITY_PROJECTS.some((project) => project.slug === id)) {
    return { slug: id, projectId: null }
  }
  return null
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

  const project = await resolveProject(params.id)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createServerServiceRoleClient()
  const { error } = liked
    ? await admin.from('community_project_likes').upsert(
        {
          project_slug: project.slug,
          project_id: project.projectId,
          user_id: user.id,
        },
        { onConflict: 'project_slug,user_id', ignoreDuplicates: true },
      )
    : await admin
        .from('community_project_likes')
        .delete()
        .eq('project_slug', project.slug)
        .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'We could not save this like. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ liked, count: await likeCount(project.slug) })
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
