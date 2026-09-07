'use client'
import { useState } from 'react'
import { LockKeyhole, Link2 } from 'lucide-react'
export function ShareBirdseye({
  initiallyEnabled,
}: {
  initiallyEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function update(share: boolean) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/birdseye/sharing', {
        method: share ? 'POST' : 'DELETE',
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || 'Sharing could not be updated.')
      setEnabled(share)
      setUrl(result.url ?? '')
      setMessage(
        share
          ? 'Link created. Anyone with this link can view all your Birdseye topics.'
          : 'Link revoked. Your Birdseye is private.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="ph-no-capture ph-mask w-full rounded-xl border border-border bg-card p-3 sm:w-80">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        {enabled ? <Link2 size={15} /> : <LockKeyhole size={15} />}
        {enabled ? 'Shared by link' : 'Private to you'}
        <span className="ml-auto text-brand">Share</span>
      </summary>
      <div className="mt-3 space-y-3 text-xs text-muted-foreground">
        <p>
          Share all your topics with anyone who has the link. You can revoke
          access here anytime. Saved copies cannot be recalled.
        </p>
        <button
          disabled={busy}
          onClick={() => update(true)}
          className="rounded-lg bg-brand px-3 py-2 font-semibold text-brand-foreground disabled:opacity-50"
        >
          {enabled ? 'Replace share link' : 'Create share link'}
        </button>
        {enabled && (
          <button
            disabled={busy}
            onClick={() => update(false)}
            className="ml-3 underline disabled:opacity-50"
          >
            Revoke link
          </button>
        )}
        {enabled && !url && (
          <p>Replacing the link disables the previous one.</p>
        )}
        {url && (
          <div className="flex gap-2">
            <input
              aria-label="Birdseye share link"
              readOnly
              value={url}
              className="min-w-0 flex-1 rounded border border-border bg-background p-2"
              onFocus={(e) => e.target.select()}
            />
            <button
              className="font-semibold text-brand"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url)
                  setMessage('Link copied.')
                } catch {
                  setMessage('Select and copy the link above.')
                }
              }}
            >
              Copy
            </button>
          </div>
        )}
        <p role="status">{busy ? 'Updating…' : message}</p>
      </div>
    </details>
  )
}
