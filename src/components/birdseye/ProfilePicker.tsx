'use client'
import Link from 'next/link'
import { useState } from 'react'
export function ProfilePicker({ profiles }: { profiles: string[] }) {
  const [query, setQuery] = useState('')
  const matches = profiles.filter((name) =>
    name.includes(query.trim().replace(/^@/, '').toLowerCase()),
  )
  return (
    <>
      <label className="mb-6 block text-sm font-semibold">
        Search profiles
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a username…"
          className="mt-2 block h-12 w-full rounded-xl border border-border bg-background px-4 font-normal"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {matches.map((username) => (
          <Link
            key={username}
            prefetch={false}
            href={`/birdseye?username=${username}`}
            className="rounded-xl border border-border p-4 text-sm font-semibold hover:border-brand hover:bg-brand/5"
          >
            @{username} <span className="float-right text-brand">↗</span>
          </Link>
        ))}
      </div>
      {!matches.length && (
        <p className="text-sm text-muted-foreground">No matching profiles.</p>
      )}
    </>
  )
}
