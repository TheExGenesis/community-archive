export interface ArchiveStorageReference {
  storage_path: string
  storage_sha256: string
}

/** New uploads are pinned to one object; null references identify legacy rows. */
export function archiveStoragePath(
  username: string,
  reference?: { storage_path?: string | null; storage_sha256?: string | null },
): string {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new Error('Invalid archive owner username')
  }
  const owner = username.toLowerCase()
  if (!reference?.storage_path && !reference?.storage_sha256) {
    return `${owner}/archive.json`
  }
  const path = reference.storage_path
  if (
    !path ||
    !/^[a-f0-9]{64}$/.test(reference.storage_sha256 ?? '') ||
    !new RegExp(`^${owner}/[a-f0-9-]{36}/archive\\.json$`).test(path)
  ) {
    throw new Error('Invalid immutable archive reference')
  }
  return path
}
