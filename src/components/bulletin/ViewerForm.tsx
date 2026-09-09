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
      className="flex flex-wrap items-center gap-2"
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
      <div className="inline-flex items-center overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-brand/40">
        <label className="flex items-center text-sm">
          <span aria-hidden="true" className="pl-3 text-muted-foreground">
            @
          </span>
          <span className="sr-only">See recommendations for</span>
          <input
            name="me"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="X handle"
            maxLength={16}
            pattern="@?[A-Za-z0-9_]{1,15}"
            className="h-9 w-32 bg-transparent px-2 text-sm outline-none"
          />
        </label>
        <button
          aria-label="Apply X handle"
          className="h-9 border-l bg-muted/60 px-3 text-sm font-medium hover:bg-muted"
        >
          Apply
        </button>
      </div>
      {unavailable && (
        <p className="text-sm text-muted-foreground">
          Top outgoing interactions are unavailable for this handle.
        </p>
      )}
    </form>
  )
}
