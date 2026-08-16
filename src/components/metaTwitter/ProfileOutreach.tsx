'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, UserPlus } from 'lucide-react'
import { getSmallAvatarUrl } from '@/lib/avatar'
import type { ArchivePerson } from '@/lib/metaTwitter/types'

export function outreachIntentHref(person: ArchivePerson) {
  const text = `@${person.screen_name} You’re one of the people I interact with most on X. I’d love to see your archive in Community Archive: https://community-archive.org/upload`
  return `https://x.com/intent/post?${new URLSearchParams({ text })}`
}

export function ProfileOutreach({ accountId }: { accountId: string }) {
  const [people, setPeople] = useState<ArchivePerson[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    void fetch(`/api/profile/${encodeURIComponent(accountId)}/outreach`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Profile outreach request failed')
        const payload = (await response.json()) as { people?: unknown }
        if (!Array.isArray(payload.people)) {
          throw new Error('Profile outreach response was invalid')
        }
        setPeople(payload.people as ArchivePerson[])
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setFailed(true)
      })
    return () => controller.abort()
  }, [accountId, attempt])

  return (
    <section
      aria-labelledby="profile-outreach-heading"
      className="rounded-xl border border-brand/20 bg-brand/5 p-3"
    >
      <h3
        id="profile-outreach-heading"
        className="flex items-center gap-1.5 text-[14px] font-extrabold"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        People you could invite
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        You interact with these accounts often, but they aren’t in Community
        Archive. A personal invitation can help.
      </p>

      {people === null && !failed && (
        <p className="mt-3 text-xs text-muted-foreground">Finding people…</p>
      )}
      {failed && (
        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
          className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Suggestions are unavailable. Retry
        </button>
      )}
      {people?.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          No non-member suggestions right now.
        </p>
      )}
      {people && people.length > 0 && (
        <div className="mt-3 flex flex-col gap-2.5">
          {people.map((person) => {
            const avatarUrl = getSmallAvatarUrl(person.avatar_media_url)
            return (
              <div key={person.user_id} className="flex items-center gap-2">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    sizes="32px"
                    className="h-8 w-8 flex-none rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-muted text-xs font-bold">
                    {person.screen_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1 text-xs leading-tight">
                  <b className="block truncate">
                    {person.name ?? person.screen_name}
                  </b>
                  <span className="text-muted-foreground">
                    @{person.screen_name} · {person.interactions} interactions
                  </span>
                </div>
                <a
                  href={outreachIntentHref(person)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-none items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                >
                  Invite
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
