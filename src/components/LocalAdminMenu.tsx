'use client'
import Link from 'next/link'
import { useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
export function LocalAdminMenu({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function toggle() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/local-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !active }),
      })
      if (!response.ok) throw new Error('Could not change local preview.')
      if (active) {
        const { error } = await createBrowserClient().auth.signOut({
          scope: 'local',
        })
        if (error) throw new Error('Could not sign out. Please try again.')
      }
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
      setBusy(false)
    }
  }
  return (
    <details className="relative text-xs">
      <summary className="cursor-pointer whitespace-nowrap rounded-lg border border-border px-3 py-2 font-semibold">
        {active ? 'Local admin' : 'Signed out'}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="font-semibold">
          {active ? 'Local admin preview' : 'Local preview is signed out'}
        </p>
        <p className="text-muted-foreground">
          Browse Birdseye as an admin. This local preview does not grant
          production write access.
        </p>
        {active && (
          <Link href="/birdseye" className="block font-semibold text-brand">
            Choose a Birdseye profile →
          </Link>
        )}
        <button
          disabled={busy}
          onClick={() => void toggle()}
          className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
        >
          {busy ? 'Updating…' : active ? 'Sign out' : 'Start local admin'}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
