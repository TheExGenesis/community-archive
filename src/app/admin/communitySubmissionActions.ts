'use server'

import { revalidatePath } from 'next/cache'
import { COMMUNITY_PROJECTS } from '@/lib/communityProjects'
import { validateCommunitySubmission } from '@/lib/communitySubmissionValidation'
import { requireAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CommunityApprovalResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string }

export async function approveCommunityProject(
  formData: FormData,
): Promise<CommunityApprovalResult> {
  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!UUID_PATTERN.test(projectId)) {
    return { ok: false, error: 'Invalid project submission.' }
  }

  const { user } = await requireAdmin('/admin')
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .update({
      status: 'published',
      published_by: user.id,
      published_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false,
      error: 'This submission could not be approved or was already published.',
    }
  }

  revalidatePath('/community')
  revalidatePath('/admin')
  return { ok: true, projectId }
}

export async function editCommunityProject(
  formData: FormData,
): Promise<CommunityApprovalResult> {
  await requireAdmin('/admin')
  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!UUID_PATTERN.test(projectId))
    return { ok: false, error: 'Invalid project submission.' }
  const validation = validateCommunitySubmission(formData)
  if (!validation.ok) return validation
  const value = validation.value
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .update({
      name: value.name,
      project_url: value.projectUrl,
      creator_name: value.creatorName,
      creator_handle: value.creatorHandle,
      category: value.category,
      description: value.description,
      archive_use: value.archiveUse,
      source_post_url: value.sourcePostUrl,
      tags: value.tags,
    })
    .eq('id', projectId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error || !data)
    return {
      ok: false,
      error:
        'This submission could not be saved. It may already have been published or deleted.',
    }
  revalidatePath('/admin')
  return { ok: true, projectId }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Edits a live Gallery entry. Curated catalog entries without a database row
 * get one on first edit; the Gallery already prefers the row for that slug.
 */
export async function editPublishedCommunityProject(
  formData: FormData,
): Promise<CommunityApprovalResult> {
  const { user } = await requireAdmin('/admin')
  const slug = String(formData.get('projectSlug') ?? '').trim()
  if (!SLUG_PATTERN.test(slug)) return { ok: false, error: 'Invalid project.' }
  const validation = validateCommunitySubmission(formData, {
    allowCatalogLinks: true,
  })
  if (!validation.ok) return validation
  const value = validation.value
  const summary = String(formData.get('summary') ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (summary.length > 160)
    return { ok: false, error: 'Card headline must be at most 160 characters.' }
  const fields = {
    name: value.name,
    summary: summary || null,
    project_url: value.projectUrl,
    creator_name: value.creatorName,
    creator_handle: value.creatorHandle,
    category: value.category,
    description: value.description,
    archive_use: value.archiveUse,
    source_post_url: value.sourcePostUrl,
    tags: value.tags,
    featured: formData.get('featured') === 'on',
  }
  const failure = {
    ok: false as const,
    error: 'This project could not be saved. Please try again.',
  }

  const admin = createServerServiceRoleClient()
  const existing = await admin
    .from('community_projects')
    .select('id, status')
    .eq('slug', slug)
    .maybeSingle()
  if (existing.error) return failure
  const row = existing.data as { id: string; status: string } | null

  let projectId: string
  if (row) {
    if (row.status !== 'published')
      return {
        ok: false,
        error: 'This project is still awaiting review. Edit it in the queue.',
      }
    const { data, error } = await admin
      .from('community_projects')
      .update(fields)
      .eq('id', row.id)
      .eq('status', 'published')
      .select('id')
      .maybeSingle()
    if (error || !data) return failure
    projectId = row.id
  } else {
    const curated = COMMUNITY_PROJECTS.find((project) => project.slug === slug)
    if (!curated) return { ok: false, error: 'Project not found.' }
    const publishedAt = `${curated.publishedAt}T12:00:00Z`
    const { data, error } = await admin
      .from('community_projects')
      .insert({
        ...fields,
        slug,
        submitter_username: curated.creatorHandle ?? 'community-archive',
        status: 'published',
        submitted_at: publishedAt,
        published_at: publishedAt,
        published_by: user.id,
      })
      .select('id')
      .maybeSingle()
    if (error || !data) return failure
    projectId = (data as { id: string }).id
  }

  revalidatePath('/community')
  revalidatePath('/')
  return { ok: true, projectId }
}

export async function deleteCommunityProject(
  formData: FormData,
): Promise<CommunityApprovalResult> {
  await requireAdmin('/admin')
  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!UUID_PATTERN.test(projectId))
    return { ok: false, error: 'Invalid project submission.' }
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin
    .from('community_projects')
    .delete()
    .eq('id', projectId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error || !data)
    return {
      ok: false,
      error:
        'This submission could not be deleted. It may already have been published or deleted.',
    }
  revalidatePath('/admin')
  return { ok: true, projectId }
}
