import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { reportServerError } from '@/lib/serverErrors'
import { removeArchiveObjects } from '@/lib/upload-archive/removeArchiveObjects'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Deletes the signed-in owner's raw archive objects. Once an account has opted
// out, the storage policies stop its own session from listing or removing
// them, so this runs with the service role. The folder comes only from the
// verified Twitter identity, never from the request.
export async function DELETE() {
  const supabase = createServerClient(await cookies())
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const username = getSessionTwitterUsername(user)
  if (!username) {
    return NextResponse.json(
      { error: 'No Twitter username on session' },
      { status: 403 },
    )
  }

  try {
    const removed = await removeArchiveObjects(
      createServerServiceRoleClient({ readSource: 'app' }),
      username,
    )
    return NextResponse.json({ removed })
  } catch (error) {
    console.error('Error deleting archive files:', error)
    await reportServerError(
      'archive_delete',
      error,
      { stage: 'remove_storage_objects' },
      user.id,
    )
    return NextResponse.json(
      { error: 'Failed to delete archive files' },
      { status: 500 },
    )
  }
}
