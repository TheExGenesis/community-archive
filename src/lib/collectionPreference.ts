export const collectionPreferenceAvailable =
  process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED === 'true'

export interface CollectionPreference {
  accountId: string
  enabled: boolean
  uploadEnabled: boolean
}

export async function loadCollectionPreference(): Promise<CollectionPreference> {
  const response = await fetch('/api/collection-preference', {
    cache: 'no-store',
  })
  const body = await response.json()
  if (
    !response.ok ||
    typeof body?.enabled !== 'boolean' ||
    typeof body?.uploadEnabled !== 'boolean' ||
    typeof body?.accountId !== 'string'
  ) {
    throw new Error('Could not load collection settings. Please try again.')
  }
  return body
}

export async function saveCollectionPreference(
  accountId: string,
  enabled: boolean,
) {
  const response = await fetch('/api/collection-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, enabled }),
  })
  const body = await response.json()
  if (
    !response.ok ||
    body?.enabled !== enabled ||
    body?.accountId !== accountId
  ) {
    throw new Error('Could not save collection settings. Please try again.')
  }
}
