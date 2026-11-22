'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type MouseEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { TweetAvatar } from '@/components/TweetAvatar'
import { loadedAvatar } from '@/lib/loadedAvatars'
import { Popover, PopoverContent } from '@/components/ui/popover'
import type { ProfilePreview as Preview } from '@/app/api/profile/[account_id]/preview/route'
import type { Person } from './profileLinks'

/** People whose @handles the answer links, keyed by lower-case handle. */
export const ProfilePeopleContext = createContext<
  ReadonlyMap<string, Person> | undefined
>(undefined)

// One request per person per page load; a failure is remembered as null so
// the card stops asking.
const previews = new Map<string, Promise<Preview | null>>()

// Previews are for signed-in members. Once the archive turns one down for that
// reason, the page stops asking for the rest.
let membersOnly = false

function loadPreview(key: string): Promise<Preview | null> {
  let pending = previews.get(key)
  if (!pending) {
    if (membersOnly) return Promise.resolve(null)
    pending = fetch(`/api/profile/${encodeURIComponent(key)}/preview`)
      .then((response) => {
        if (response.status === 401) membersOnly = true
        return response.ok ? (response.json() as Promise<Preview>) : null
      })
      .then((preview) => {
        if (preview) primeProfilePreviews([preview])
        return preview
      })
      .catch(() => null)
    previews.set(key, pending)
  }
  return pending
}

// Previews a page already resolved, or that a hover already fetched, readable
// synchronously so the card opens complete.
const known = new Map<string, Preview>()

/** Hand over previews the page loaded with itself. */
export function primeProfilePreviews(list: readonly Preview[]) {
  for (const preview of list) {
    for (const key of [preview.accountId, preview.username.toLowerCase()]) {
      known.set(key, preview)
      previews.set(key, Promise.resolve(preview))
    }
  }
}

const knownPreview = (person: Person) =>
  (person.accountId && known.get(person.accountId)) ||
  known.get(person.username.toLowerCase())

const previewKey = (person: Person) => person.accountId ?? person.username

/** Forgets fetched previews; for tests. */
export function clearProfilePreviews() {
  previews.clear()
  known.clear()
  membersOnly = false
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
  newTab = true,
}: {
  person: Person
  href: string
  /** Whether "Open profile" opens a new tab, as links in an answer do. */
  newTab?: boolean
}) {
  const key = previewKey(person)
  const [preview, setPreview] = useState<Preview | null | undefined>(() =>
    knownPreview(person),
  )
  useEffect(() => {
    if (knownPreview(person)) return
    let live = true
    void loadPreview(key).then((result) => {
      if (live) setPreview(result)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by person
  }, [key])

  const count = person.tweets ?? 0
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
            // The photo the page already shows for them, when it has one.
            avatar:
              loadedAvatar(person) ?? person.avatar ?? preview?.avatar ?? null,
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
          {count.toLocaleString('en-US')} {count === 1 ? 'tweet' : 'tweets'}{' '}
          found for this question
        </p>
      )}
      <Link
        href={href}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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
 * Wraps an avatar, a name or a handle so that, on a pointer that can hover, a
 * card with the person's bio opens after a short pause and stays while the
 * pointer moves onto it. Touch screens just follow the wrapped link. The
 * child must be a single element that takes a ref and mouse handlers.
 *
 * By default the card waits for the bio and stays shut without one (signed
 * out, say), since the name and avatar are already on screen. `eager` opens
 * it at once with what `person` holds, for callers that add facts of their own.
 */
export function ProfileHoverCard({
  person,
  href,
  newTab = false,
  eager = false,
  children,
}: {
  person: Person
  href: string
  newTab?: boolean
  eager?: boolean
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hovering = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), ms)
  }
  const show = () => {
    if (eager || knownPreview(person)) return setOpen(true)
    void loadPreview(previewKey(person)).then((preview) => {
      if (preview && hovering.current) setOpen(true)
    })
  }
  // The card is portalled, but React still bubbles its events to the wrapped
  // element's ancestors; a clickable tweet row must not open from a click here.
  const contain = (event: MouseEvent) => event.stopPropagation()

  if (!person.username) return children
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor
        asChild
        onMouseEnter={() => {
          if (!window.matchMedia('(hover: hover)').matches) return
          hovering.current = true
          clearTimeout(timer.current)
          timer.current = setTimeout(show, 300)
        }}
        onMouseLeave={() => {
          hovering.current = false
          later(false, 150)
        }}
      >
        {children}
      </PopoverPrimitive.Anchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-0"
        onMouseEnter={() => clearTimeout(timer.current)}
        onMouseLeave={() => later(false, 150)}
        onClick={contain}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ProfileCard person={person} href={href} newTab={newTab} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A handle in the answer, linked to the profile, with a hover card for the
 * people the run knows about.
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
  const link = (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children}
    </Link>
  )
  if (!person) return link
  return (
    <ProfileHoverCard person={person} href={href} newTab eager>
      {link}
    </ProfileHoverCard>
  )
}
