import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import { COMMUNITY_COVER_BUCKET } from '@/lib/communitySubmissionValidation'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createServerServiceRoleClient()
  const { data: project, error } = await admin
    .from('community_projects')
    .select('cover_storage_path, cover_mime_type, status')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !project?.cover_storage_path || !project.cover_mime_type) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (project.status !== 'published') {
    const user = await getCurrentUser()
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const { data, error: downloadError } = await admin.storage
    .from(COMMUNITY_COVER_BUCKET)
    .download(project.cover_storage_path)
  if (downloadError || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': project.cover_mime_type,
      'Cache-Control':
        project.status === 'published'
          ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
          : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
