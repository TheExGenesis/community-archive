'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'

/** Compact profile header for shelf pages. */
export function ShelfHeader({
  displayName,
  username,
  avatarUrl,
  profileHref,
  title,
  summary,
  actions,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  profileHref: string
  title: string
  summary: ReactNode
  actions?: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const avatar = failed ? null : getHighResolutionAvatarUrl(avatarUrl)
  return (
    <header className="border-b border-border px-4 pb-5 pt-6 sm:px-6">
      <Link
        href={profileHref}
        className="inline-flex items-center gap-2.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {avatar ? (
          <Image
            src={avatar}
            alt=""
            width={32}
            height={32}
            sizes="32px"
            className="h-8 w-8 rounded-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
          >
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span>
          <span className="font-semibold text-foreground">{displayName}</span> @
          {username}
        </span>
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {summary}
          </p>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
