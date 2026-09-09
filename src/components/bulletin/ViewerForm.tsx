'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ViewerForm({
  username = '',
  unavailable = false,
}: {
  username?: string
  unavailable?: boolean
}) {
  const router = useRouter()
  const [handle, setHandle] = useState(username)
  useEffect(() => {
    if (username) return
    try {
      const saved = localStorage.getItem('ca.bulletin.viewer.v1')
      if (saved && /^[A-Za-z0-9_]{1,15}$/.test(saved)) setHandle(saved)
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, [username])
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const normalized = handle.trim().replace(/^@/, '')
        try {
          localStorage.setItem('ca.bulletin.viewer.v1', normalized)
        } catch {}
        router.push(
          '/opportunities' +
            (normalized ? '?me=' + encodeURIComponent(normalized) : '') +
            window.location.hash,
        )
      }}
    >
      <label className="text-sm">
        See recommendations for
        <input
          name="me"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Your X handle"
          maxLength={16}
          pattern="@?[A-Za-z0-9_]{1,15}"
          className="mt-1 block rounded-md border bg-background px-3 py-2"
        />
      </label>
      <button className="rounded-md border px-4 py-2 text-sm">Apply</button>
      {unavailable && (
        <p className="text-sm text-muted-foreground">
          No archived follow relationships available for this handle.
        </p>
      )}
    </form>
  )
}
