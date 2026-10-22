import type { SupabaseClient } from '@supabase/supabase-js'

const ARCHIVES_BUCKET = 'archives'
const LIST_PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 100
const ARCHIVE_OWNER = /^[A-Za-z0-9_]{1,15}$/

type StorageClient = Pick<SupabaseClient, 'storage'>

/** Storage list() returns one level: a legacy `<owner>/archive.json` is a file
 * entry, while each pinned `<owner>/<uuid>/archive.json` upload appears as a
 * `<uuid>` folder entry with a null id. Walk every folder and every page. */
async function listObjectPaths(
  client: StorageClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await client.storage
      .from(ARCHIVES_BUCKET)
      .list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) throw new Error(`Failed to list archive files: ${error.message}`)

    const entries = data ?? []
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`
      if (entry.id) paths.push(path)
      else paths.push(...(await listObjectPaths(client, path)))
    }
    if (entries.length < LIST_PAGE_SIZE) return paths
  }
}

/** Removes every raw archive object below the owner's lowercase folder and
 * returns how many were removed. Call it with the service-role client: the
 * storage policies hide an opted-out owner's objects from their own session. */
export async function removeArchiveObjects(
  client: StorageClient,
  username: string,
): Promise<number> {
  // An empty prefix would list the bucket root, so validate before listing.
  if (!ARCHIVE_OWNER.test(username)) {
    throw new Error('Invalid archive owner username')
  }
  const owner = username.toLowerCase()

  const paths = await listObjectPaths(client, owner)
  for (let offset = 0; offset < paths.length; offset += REMOVE_BATCH_SIZE) {
    const { error } = await client.storage
      .from(ARCHIVES_BUCKET)
      .remove(paths.slice(offset, offset + REMOVE_BATCH_SIZE))
    if (error) {
      throw new Error(`Failed to remove archive files: ${error.message}`)
    }
  }

  // remove() reports success for paths it did not delete, so confirm the
  // folder is empty instead of trusting it.
  const remaining = await listObjectPaths(client, owner)
  if (remaining.length > 0) {
    throw new Error(`${remaining.length} archive files were not removed`)
  }
  return paths.length
}
