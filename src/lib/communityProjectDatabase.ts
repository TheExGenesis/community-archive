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
  likeCount = 0,
  commentCount = 0,
): CommunityProject {
  return {
    likeCount,
    commentCount,
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

type CommunityProjectLikeRow = {
  project_id: string
  user_id: string
}

type CommunityProjectCommentRow = {
  project_id: string
  deleted_at: string | null
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

  const rows = (data ?? []) as unknown as CommunityProjectRow[]
  const projectIds = rows.map((row) => row.id)
  const [likeCounts, commentCounts] = await Promise.all([
    loadCommunityProjectLikeCounts(projectIds),
    loadCommunityProjectCommentCounts(projectIds),
  ])

  return rows.map((row) =>
    mapCommunityProjectRow(
      row,
      likeCounts.get(row.id) ?? 0,
      commentCounts.get(row.id) ?? 0,
    ),
  )
}

async function loadCommunityProjectCommentCounts(
  projectIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!projectIds.length) return counts

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_comments')
    .select('project_id, deleted_at')
    .in('project_id', projectIds)
    .is('deleted_at', null)

  if (error) return counts

  for (const comment of (data ??
    []) as unknown as CommunityProjectCommentRow[]) {
    counts.set(comment.project_id, (counts.get(comment.project_id) ?? 0) + 1)
  }
  return counts
}

async function loadCommunityProjectLikeCounts(
  projectIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!projectIds.length) return counts

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_likes')
    .select('project_id, user_id')
    .in('project_id', projectIds)

  if (error) return counts

  for (const like of (data ?? []) as unknown as CommunityProjectLikeRow[]) {
    counts.set(like.project_id, (counts.get(like.project_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Database ids of the published projects the given user has liked. Returns an
 * empty list when signed out or when the likes table is unavailable.
 */
export async function loadCommunityProjectLikesForUser(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return []

  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_project_likes')
    .select('project_id, user_id')
    .eq('user_id', userId)

  if (error) return []
  return ((data ?? []) as unknown as CommunityProjectLikeRow[]).map(
    (like) => like.project_id,
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
