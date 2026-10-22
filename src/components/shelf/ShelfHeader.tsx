'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'

/**
 * Shelf page header: the avatar, the title (which carries the member's name)
 * and their handle, so the name appears once.
 */
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
  // The handle's first letter: a display name may start with an emoji.
  const initial = username.charAt(0).toUpperCase()
  return (
    <header className="px-4 pb-2 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* The handle below is the keyboard path to the same profile. */}
          <Link
            href={profileHref}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0"
          >
            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={64}
                height={64}
                sizes="64px"
                className="h-14 w-14 rounded-full object-cover sm:h-16 sm:w-16"
                onError={() => setFailed(true)}
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground sm:h-16 sm:w-16">
                {initial}
              </span>
            )}
          </Link>
          <div className="min-w-0">
            {/* h1 takes the site's Petrona from globals.css. */}
            <h1 className="text-4xl font-semibold leading-none tracking-tight [text-wrap:balance] sm:text-5xl">
              {title}
            </h1>
            <Link
              href={profileHref}
              className="mt-2 inline-block rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              @{username}
            </Link>
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {summary ? (
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          {summary}
        </p>
      ) : null}
    </header>
  )
}
