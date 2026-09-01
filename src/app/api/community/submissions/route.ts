import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import {
  COMMUNITY_COVER_BUCKET,
  COMMUNITY_COVER_MAX_BYTES,
  communityProjectSlug,
  coverExtension,
  validateCommunitySubmission,
} from '@/lib/communitySubmissionValidation'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

async function ensureCoverBucket() {
  const admin = createServerServiceRoleClient()
  const { data, error } = await admin.storage.getBucket(COMMUNITY_COVER_BUCKET)
  if (data) return
  if (error && !/not found/i.test(error.message)) throw error

  const { error: createError } = await admin.storage.createBucket(
    COMMUNITY_COVER_BUCKET,
    {
      public: false,
      fileSizeLimit: COMMUNITY_COVER_MAX_BYTES,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  )
  if (createError && !/already exists/i.test(createError.message)) {
    throw createError
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before submitting a project.' },
      { status: 401 },
    )
  }

  const submitterUsername = getSessionTwitterUsername(user)
  if (!submitterUsername) {
    return NextResponse.json(
      { error: 'Sign in with X before submitting a project.' },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid submission form.' },
      { status: 400 },
    )
  }

  const validation = validateCommunitySubmission(formData)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const project = validation.value
  const id = randomUUID()
  const slug = communityProjectSlug(project.name, id)
  const admin = createServerServiceRoleClient()
  let coverStoragePath: string | null = null

  try {
    if (project.cover) {
      await ensureCoverBucket()
      coverStoragePath = `${user.id}/${id}.${coverExtension(project.cover.type)}`
      const { error: uploadError } = await admin.storage
        .from(COMMUNITY_COVER_BUCKET)
        .upload(coverStoragePath, await project.cover.arrayBuffer(), {
          contentType: project.cover.type,
          upsert: false,
        })
      if (uploadError) throw uploadError
    }

    const { error: insertError } = await admin
      .from('community_projects')
      .insert({
        id,
        slug,
        name: project.name,
        project_url: project.projectUrl,
        creator_name: project.creatorName,
        creator_handle: project.creatorHandle,
        category: project.category,
        description: project.description,
        archive_use: project.archiveUse,
        source_post_url: project.sourcePostUrl,
        tags: project.tags,
        cover_storage_path: coverStoragePath,
        cover_mime_type: project.cover?.type ?? null,
        submitted_by: user.id,
        submitter_username: submitterUsername,
        status: 'pending',
      })
    if (insertError) throw insertError

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch {
    if (coverStoragePath) {
      await admin.storage
        .from(COMMUNITY_COVER_BUCKET)
        .remove([coverStoragePath])
    }
    return NextResponse.json(
      { error: 'We could not save this submission. Please try again.' },
      { status: 500 },
    )
  }
}
