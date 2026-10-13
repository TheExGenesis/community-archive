'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { TweetAvatar } from '@/components/TweetAvatar'
import { Popover, PopoverContent } from '@/components/ui/popover'
import type { ProfilePreview as Preview } from '@/app/api/profile/[account_id]/preview/route'
import type { Person } from './profileLinks'

/** People whose @handles the answer links, keyed by lower-case handle. */
export const ProfilePeopleContext = createContext<
  ReadonlyMap<string, Person> | undefined
>(undefined)

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthOf = (iso?: string) => (iso ? monthFormat.format(new Date(iso)) : '')

// One request per person per page load; a failure is remembered as null so
// the card stops asking.
const previews = new Map<string, Promise<Preview | null>>()

function loadPreview(key: string): Promise<Preview | null> {
  let pending = previews.get(key)
  if (!pending) {
    pending = fetch(`/api/profile/${encodeURIComponent(key)}/preview`)
      .then((response) =>
        response.ok ? (response.json() as Promise<Preview>) : null,
      )
      .catch(() => null)
    previews.set(key, pending)
  }
  return pending
}

/** Forgets fetched previews; for tests. */
export function clearProfilePreviews() {
  previews.clear()
}

const handleOf = (children: ReactNode) => {
  const text = Array.isArray(children)
    ? children.join('')
    : String(children ?? '')
  return text.trim().replace(/^@/, '').toLowerCase()
}

/**
 * What the run already knows about someone, at once, and their bio and
 * profile facts once the archive answers.
 */
export function ProfileCard({
  person,
  href,
}: {
  person: Person
  href: string
}) {
  const key = person.accountId ?? person.username
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadPreview(key).then((result) => {
      if (live) setPreview(result)
    })
    return () => {
      live = false
    }
  }, [key])

  const count = person.tweets ?? 0
  const from = monthOf(person.firstAt)
  const to = monthOf(person.lastAt)
  const range = from && to && from !== to ? `${from} to ${to}` : from
  const facts = preview
    ? [
        preview.location,
        preview.followers !== null
          ? `${preview.followers.toLocaleString('en-US')} followers`
          : null,
      ].filter(Boolean)
    : []

  return (
    <div className="space-y-2.5 p-3 text-sm">
      <div className="flex items-center gap-2.5">
        <TweetAvatar
          tweet={{
            id: person.tweetId ?? person.username,
            username: person.username,
            avatar: person.avatar ?? preview?.avatar ?? null,
          }}
          size={40}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {preview?.displayName || person.name || person.username}
          </p>
          <p className="truncate text-muted-foreground">@{person.username}</p>
        </div>
      </div>
      {preview === undefined ? (
        <div
          aria-hidden="true"
          data-testid="profile-loading"
          className="h-3.5 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none"
        />
      ) : (
        preview?.bio && (
          <p className="line-clamp-3 break-words text-foreground">
            {preview.bio}
          </p>
        )
      )}
      {facts.length > 0 && (
        <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
      )}
      {count > 0 && (
        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'tweet' : 'tweets'} in this answer’s results
          {range ? ` · ${range}` : ''}
        </p>
      )}
      <Link
        href={href}
        className="inline-block rounded-sm text-xs font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Open profile
      </Link>
    </div>
  )
}

const LINK_CLASS =
  'rounded-sm underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

/**
 * A handle in the answer, linked to the profile. On a pointer that can hover,
 * a card about the person opens after a short pause and stays while the
 * pointer moves onto it; touch screens just follow the link.
 */
export function ProfileLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const people = useContext(ProfilePeopleContext)
  const person = people?.get(handleOf(children))
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), ms)
  }

  const link = (
    <Link
      href={href}
      className={LINK_CLASS}
      onMouseEnter={() => {
        if (person && window.matchMedia('(hover: hover)').matches) {
          later(true, 300)
        }
      }}
      onMouseLeave={() => later(false, 150)}
    >
      {children}
    </Link>
  )
  if (!person) return link
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>{link}</PopoverPrimitive.Anchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-0"
        onMouseEnter={() => clearTimeout(timer.current)}
        onMouseLeave={() => later(false, 150)}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ProfileCard person={person} href={href} />
      </PopoverContent>
    </Popover>
  )
}
