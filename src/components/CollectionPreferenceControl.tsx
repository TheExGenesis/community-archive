'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  loadCollectionPreference,
  saveCollectionPreference,
  type CollectionPreference,
} from '@/lib/collectionPreference'

export function CollectionPreferenceControl({
  disabled = false,
}: {
  disabled?: boolean
}) {
  const [preference, setPreference] = useState<CollectionPreference | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      setPreference(await loadCollectionPreference())
    } catch {
      setError('Could not load collection settings.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const save = async (enabled: boolean) => {
    if (!preference || busy) return
    setBusy(true)
    setError(null)
    try {
      await saveCollectionPreference(preference.accountId, enabled)
      setPreference({ ...preference, enabled })
    } catch {
      setError(
        'Could not save collection settings. Your preference was not changed.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="ongoing-collection">Ongoing collection</Label>
        <Switch
          id="ongoing-collection"
          checked={preference?.enabled ?? false}
          disabled={disabled || busy || !preference}
          onCheckedChange={save}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        When off, we stop collecting your tweets through the crawler and browser
        extension. Your uploaded archives stay public, and you can upload again
        at any time. Previously archived tweets remain, even if you later delete
        them on X. Collection already in progress may finish.
      </p>
      {!preference && !error && (
        <p role="status">Loading collection settings…</p>
      )}
      {preference && (
        <p role="status" className="text-sm">
          {preference.enabled
            ? 'Ongoing collection is on.'
            : 'Archive only: ongoing collection is off.'}
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm text-red-600">
          {error}{' '}
          {!preference && (
            <Button variant="link" onClick={load} disabled={busy}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
