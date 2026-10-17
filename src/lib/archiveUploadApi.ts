export class ArchiveUploadDeleteError extends Error {
  constructor(
    message: string,
    // True when the archive's data was deleted but its raw file was not.
    readonly archiveDeleted: boolean,
  ) {
    super(message)
    this.name = 'ArchiveUploadDeleteError'
  }
}

/** Deletes one of the signed-in account's archive uploads and its raw archive
 * file. The server derives the owner from the session, so only the id is sent. */
export async function deleteArchiveUpload(
  archiveUploadId: number,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(`/api/archive-uploads/${archiveUploadId}`, {
    method: 'DELETE',
  })
  if (response.ok) return

  let body: { error?: unknown; archiveDeleted?: unknown } | null = null
  try {
    body = await response.json()
  } catch {
    // Fall through to the generic message.
  }
  const serverError = body?.error
  throw new ArchiveUploadDeleteError(
    typeof serverError === 'string' && serverError.trim()
      ? serverError.trim()
      : 'Failed to delete archive',
    body?.archiveDeleted === true,
  )
}
