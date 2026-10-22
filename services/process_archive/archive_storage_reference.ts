export interface ArchiveStorageReference {
  storage_path: string
  storage_sha256: string
}

const TWITTER_USERNAME = /^[A-Za-z0-9_]{1,15}$/

/** New uploads are pinned to one object; null references identify legacy rows. */
export function archiveStoragePath(
  username: string,
  reference?: { storage_path?: string | null; storage_sha256?: string | null },
): string {
  if (!TWITTER_USERNAME.test(username)) {
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

export type ArchiveOwnerErrorCode =
  | 'archive_owner_unverified'
  | 'archive_owner_mismatch'

/** The upload row names an owner that its account's trusted identity does not confirm. */
export class ArchiveOwnerError extends Error {
  readonly code: ArchiveOwnerErrorCode

  constructor(code: ArchiveOwnerErrorCode, message: string) {
    super(message)
    this.name = 'ArchiveOwnerError'
    this.code = code
  }
}

export interface ArchiveUploadOwnerRow {
  account_id?: string | number | null
  username?: string | null
  storage_path?: string | null
  storage_sha256?: string | null
}

/**
 * Resolves the Storage object for an archive_upload row from its account's
 * trusted handle. The row's `username` is written by the uploading client, so
 * it is only accepted when it names that same handle; the folder always comes
 * from `trustedOwner`.
 */
export function trustedArchiveStoragePath(
  upload: ArchiveUploadOwnerRow,
  trustedOwner: string | null | undefined,
): string {
  const uploadId = `account_id=${upload.account_id ?? 'unknown'}`
  if (typeof trustedOwner !== 'string' || !TWITTER_USERNAME.test(trustedOwner)) {
    throw new ArchiveOwnerError(
      'archive_owner_unverified',
      `Archive owner has no trusted Twitter handle (${uploadId})`,
    )
  }
  const owner = trustedOwner.toLowerCase()
  if (
    typeof upload.username !== 'string' ||
    upload.username.toLowerCase() !== owner
  ) {
    throw new ArchiveOwnerError(
      'archive_owner_mismatch',
      `Archive upload username ${JSON.stringify(upload.username ?? null)} does not match the account's trusted handle ${JSON.stringify(owner)} (${uploadId})`,
    )
  }
  return archiveStoragePath(owner, upload)
}
