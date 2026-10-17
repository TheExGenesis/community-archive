import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveStoragePath } from './archiveStorageReference'

const ARCHIVES_BUCKET = 'archives'

export interface DeletedArchiveUpload {
  account_id: string
  storage_path: string | null
  storage_sha256: string | null
}

/** removed: the object is gone (or was already missing). referenced: another
 * archive_upload row still resolves to it, so it was kept. outside_owner:
 * the row points outside the signed-in owner's folder, so it was not touched. */
export type ArchiveUploadObjectOutcome =
  | 'removed'
  | 'referenced'
  | 'outside_owner'

type Client = Pick<SupabaseClient, 'from' | 'storage'>

// Usernames are [A-Za-z0-9_], and `_` is a LIKE wildcard.
const exactUsernamePattern = (owner: string) => owner.replace(/_/g, '\\_')

async function countRows(
  query: PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>,
) {
  const { count, error } = await query
  if (error) {
    throw new Error(`Failed to check archive references: ${error.message}`)
  }
  return count ?? 0
}

/** Legacy rows have no storage_path and resolve to `<owner>/archive.json`
 * through whoever currently holds that handle, so count null-path rows for
 * this account and for any account or upload recorded under the handle. */
async function countLegacyReferences(
  client: Client,
  owner: string,
  accountId: string,
) {
  const pattern = exactUsernamePattern(owner)
  const { data: accounts, error } = await client
    .from('all_account')
    .select('account_id')
    .ilike('username', pattern)
  if (error) {
    throw new Error(`Failed to check archive references: ${error.message}`)
  }
  const accountIds = Array.from(
    new Set([accountId, ...(accounts ?? []).map((row) => row.account_id)]),
  )

  const byAccount = await countRows(
    client
      .from('archive_upload')
      .select('id', { count: 'exact', head: true })
      .is('storage_path', null)
      .in('account_id', accountIds),
  )
  const byUsername = await countRows(
    client
      .from('archive_upload')
      .select('id', { count: 'exact', head: true })
      .is('storage_path', null)
      .ilike('username', pattern),
  )
  return byAccount + byUsername
}

async function objectExists(client: Client, path: string) {
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const { data, error } = await client.storage
    .from(ARCHIVES_BUCKET)
    .list(path.slice(0, slash), { search: name, limit: 100 })
  if (error) throw new Error(`Failed to verify archive file: ${error.message}`)
  return (data ?? []).some((entry) => entry.id && entry.name === name)
}

/** Removes the raw object of an archive_upload row that delete_single_archive
 * has just deleted. Call it with the service-role client after that delete,
 * so the reference counts no longer include the row and the storage policies
 * cannot hide an opted-out owner's object. `username` must come from the
 * verified session; it bounds which folder this may touch. */
export async function removeArchiveUploadObject(
  client: Client,
  username: string,
  upload: DeletedArchiveUpload,
): Promise<ArchiveUploadObjectOutcome> {
  let path: string
  try {
    // Throws when a pinned path is not under `<username>/`, so only the
    // verified session's own folder is ever touched.
    path = archiveStoragePath(username, upload)
  } catch {
    return 'outside_owner'
  }

  const references = upload.storage_path
    ? await countRows(
        client
          .from('archive_upload')
          .select('id', { count: 'exact', head: true })
          .eq('storage_path', path),
      )
    : await countLegacyReferences(
        client,
        username.toLowerCase(),
        upload.account_id,
      )
  if (references > 0) return 'referenced'

  const { error } = await client.storage.from(ARCHIVES_BUCKET).remove([path])
  if (error) throw new Error(`Failed to remove archive file: ${error.message}`)

  // remove() reports success for paths it skipped, so check the object is gone.
  if (await objectExists(client, path)) {
    throw new Error('Archive file was not removed')
  }
  return 'removed'
}
