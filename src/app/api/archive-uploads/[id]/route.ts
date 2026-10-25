import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { removeArchiveUploadObject } from '@/lib/upload-archive/removeArchiveUploadObject'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Positive bigint ids that stay within Number.MAX_SAFE_INTEGER.
const ARCHIVE_UPLOAD_ID = /^[1-9][0-9]{0,14}$/

// Deletes one of the signed-in owner's archive uploads and its raw archive
// object. delete_single_archive removes the row, which is the only record of
// the pinned object path, so the row is read first. Storage cleanup uses the
// service role because the storage policies hide an opted-out owner's objects
// from their own session; the folder comes only from the verified identity.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!ARCHIVE_UPLOAD_ID.test(params.id)) {
    return NextResponse.json({ error: 'Invalid archive id' }, { status: 400 })
  }
  const archiveUploadId = Number(params.id)

  const supabase = createServerClient(await cookies())
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const username = getSessionTwitterUsername(user)
  const providerId = user.app_metadata?.provider_id
  if (!username || typeof providerId !== 'string' || !providerId.trim()) {
    return NextResponse.json(
      { error: 'No Twitter identity on session' },
      { status: 403 },
    )
  }

  const serviceRole = createServerServiceRoleClient({ readSource: 'app' })
  const { data: upload, error: uploadError } = await serviceRole
    .from('archive_upload')
    .select('account_id,storage_path,storage_sha256')
    .eq('id', archiveUploadId)
    .eq('account_id', providerId)
    .maybeSingle()
  if (uploadError) {
    console.error('Error reading archive upload:', uploadError)
    return NextResponse.json(
      { error: 'Failed to delete archive' },
      { status: 500 },
    )
  }
  if (!upload) {
    return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
  }

  // The session runs the RPC so its own JWT ownership check still applies.
  const { error: deleteError } = await supabase.rpc('delete_single_archive', {
    p_account_id: providerId,
    p_archive_upload_id: archiveUploadId,
  })
  if (deleteError) {
    console.error('Error deleting archive upload:', deleteError)
    return NextResponse.json(
      { error: 'Failed to delete archive' },
      { status: 500 },
    )
  }

  try {
    const file = await removeArchiveUploadObject(serviceRole, username, upload)
    if (file === 'outside_owner') {
      console.warn(
        `Archive upload ${archiveUploadId} pointed outside ${username}/; its file was kept`,
      )
    }
    return NextResponse.json({ deleted: true, file })
  } catch (error) {
    console.error('Error deleting archive file:', error)
    return NextResponse.json(
      {
        error: 'Archive deleted, but its raw archive file could not be removed',
        archiveDeleted: true,
      },
      { status: 500 },
    )
  }
}
