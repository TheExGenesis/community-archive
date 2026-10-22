'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/utils/tailwind'
import { getSmallAvatarUrl } from '@/lib/avatar'
import { userProfileHref } from '@/lib/navigation'
import { shelfTileHue } from '@/lib/shelf/labels'
import type { ShelfPerson } from '@/lib/shelf/types'

function Face({
  person,
  size,
  ring,
}: {
  person: ShelfPerson
  size: number
  ring: string
}) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : getSmallAvatarUrl(person.avatar)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-2',
        ring,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: `hsl(${shelfTileHue(person.accountId)} 32% 42%)`,
      }}
    >
      {src ? (
        // Avatars are small and already resized by Twitter's CDN.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">
          {person.username.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}

/**
 * Members who also tweeted about a work, as overlapping faces. Ids without a
 * known member are skipped; the count after the faces covers everyone.
 */
export function ShelfFacepile({
  ids,
  people,
  max = 3,
  size = 20,
  ring = 'ring-card',
  linked = false,
  className,
}: {
  ids: string[]
  people: Record<string, ShelfPerson>
  max?: number
  size?: number
  /** Tailwind ring colour matching the surface behind the faces. */
  ring?: string
  /** Each face links to the member's profile (drawer use). */
  linked?: boolean
  className?: string
}) {
  const known = ids.flatMap((id) => people[id] ?? [])
  if (!known.length) return null
  const shown = known.slice(0, max)
  const rest = ids.length - shown.length
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className="flex" style={{ marginRight: rest > 0 ? 6 : 0 }}>
        {shown.map((person, index) => (
          <span
            key={person.accountId}
            style={{ marginLeft: index ? -Math.round(size * 0.28) : 0 }}
            title={`@${person.username}`}
          >
            {linked ? (
              <Link
                href={userProfileHref(person.username, person.accountId)}
                className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Face person={person} size={size} ring={ring} />
                <span className="sr-only">@{person.username}</span>
              </Link>
            ) : (
              <Face person={person} size={size} ring={ring} />
            )}
          </span>
        ))}
      </span>
      {rest > 0 ? (
        <span className="text-xs tabular-nums opacity-80">+{rest}</span>
      ) : null}
    </span>
  )
}
