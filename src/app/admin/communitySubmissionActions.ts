'use server'

import { revalidatePath } from 'next/cache'
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
