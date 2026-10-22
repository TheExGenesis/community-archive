/** Deletes every raw archive file the signed-in account has uploaded. The
 * server derives the owner from the session, so nothing is sent. */
export async function deleteOwnArchiveFiles(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl('/api/archive', { method: 'DELETE' })
  if (response.ok) return

  let serverError: unknown = null
  try {
    serverError = ((await response.json()) as { error?: unknown } | null)?.error
  } catch {
    // Fall through to the generic message.
  }
  throw new Error(
    typeof serverError === 'string' && serverError.trim()
      ? serverError.trim()
      : 'Failed to delete archive files',
  )
}
