import 'server-only'

import type {
  CommunityProject,
  CommunityProjectCategory,
} from '@/lib/communityProjects'
import { createServerServiceRoleClient } from '@/utils/supabase'

export type CommunityProjectRow = {
  id: string
  slug: string
  name: string
  project_url: string
  creator_name: string
  creator_handle: string | null
  category: CommunityProjectCategory
  description: string
  archive_use: string
  source_post_url: string
  tags: string[]
  cover_storage_path: string | null
  cover_mime_type: string | null
  submitter_username: string
  status: 'pending' | 'published'
  featured: boolean
  submitted_at: string
  published_at: string | null
}

const PROJECT_SELECT =
  'id, slug, name, project_url, creator_name, creator_handle, category, description, archive_use, source_post_url, tags, cover_storage_path, cover_mime_type, submitter_username, status, featured, submitted_at, published_at'

function sourceTweetId(sourceUrl: string) {
  return new URL(sourceUrl).pathname.match(/\/status\/(\d{1,20})/)?.[1] ?? ''
}

export function mapCommunityProjectRow(
  row: CommunityProjectRow,
): CommunityProject {
  return {
    databaseId: row.id,
    slug: row.slug,
    name: row.name,
    creator: row.creator_name,
    creatorHandle: row.creator_handle ?? undefined,
    summary: row.description,
    description: row.description,
    archiveUse: row.archive_use,
    category: row.category,
    tags: row.tags,
    projectUrl: row.project_url,
    sourceTweetId: sourceTweetId(row.source_post_url),
    sourceUrl: row.source_post_url,
    image: row.cover_storage_path
      ? `/api/community/projects/${row.id}/cover`
      : undefined,
    coverClass: 'from-[#8BD2EE] via-[#75C9EB] to-[#25AADF]',
    featured: row.featured,
    publishedAt: row.published_at ?? row.submitted_at,
  }
}

export async function loadPublishedCommunityProjects(): Promise<
  CommunityProject[]
> {
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .select(PROJECT_SELECT)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) {
    // The gallery's checked-in catalog remains available during rollout or a
    // transient database failure.
    return []
  }

  return ((data ?? []) as unknown as CommunityProjectRow[]).map(
    mapCommunityProjectRow,
  )
}

export async function loadPendingCommunityProjects(): Promise<
  CommunityProjectRow[]
> {
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .select(PROJECT_SELECT)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw new Error('Unable to load pending Community submissions')
  return (data ?? []) as unknown as CommunityProjectRow[]
}
