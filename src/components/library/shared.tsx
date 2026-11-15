'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { TweetAvatar } from '@/components/TweetAvatar'
import { TweetCard } from '@/components/TweetCard'
import {
  LIBRARY_KINDS,
  libraryShard,
  libraryShardUrl,
  libraryTweetToPortal,
  type LibraryDetail,
  type LibraryTweet,
  type LibraryWork,
} from '@/lib/library'
import { libraryCoverSrc } from '@/lib/libraryCover'
import { userProfileHref } from '@/lib/navigation'

export const KIND_LABEL = Object.fromEntries(
  LIBRARY_KINDS.map(([k, , one]) => [k, one]),
)

export const libraryWorkHref = (id: string) => `/library/${id}`

type Shard = Record<string, LibraryDetail>

const PORTRAIT = new Set(['book', 'film'])

// Drawn covers for works without a picture: one tint per kind, each with a
// dark-theme pair so the title keeps its contrast.
const COVER_TINT: Record<string, string> = {
  essay: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  paper: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  site: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  code: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  wiki: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  book: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200',
  film: 'bg-zinc-800 text-zinc-100 dark:bg-zinc-900 dark:text-zinc-200',
}

export function Cover({
  work: w,
  large = false,
}: {
  work: LibraryWork
  large?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const portrait = PORTRAIT.has(w.k)
  const shape = large
    ? portrait
      ? 'aspect-[2/3] w-28 sm:w-36'
      : 'aspect-[16/10] w-44 sm:w-56'
    : portrait
      ? 'aspect-[2/3] w-10 sm:w-12'
      : 'aspect-[16/10] w-full'
  return (
    <span
      className={`relative mx-auto block shrink-0 overflow-hidden rounded-[3px] border border-border/60 ${shape}`}
      aria-hidden="true"
    >
      {w.im && !broken ? (
        <Image
          src={libraryCoverSrc(w.id, w.im)}
          alt=""
          fill
          sizes={large ? '224px' : '72px'}
          className="object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className={`flex h-full w-full items-end font-serif font-medium leading-[1.15] ${large ? 'p-2.5 text-sm' : 'p-1 text-[0.5rem] sm:text-[0.55rem]'} ${COVER_TINT[w.k] ?? 'bg-muted text-muted-foreground'}`}
        >
          <span className="line-clamp-3 break-words">{w.t}</span>
        </span>
      )}
    </span>
  )
}

const shardCache = new Map<number, Promise<Shard>>()

function loadShard(n: number): Promise<Shard> {
  let p = shardCache.get(n)
  if (!p) {
    p = fetch(libraryShardUrl(n)).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)),
    )
    p.catch(() => shardCache.delete(n))
    shardCache.set(n, p)
  }
  return p
}

/** One work's members and tweets; null while loading, 'failed' on error. */
export function useLibraryDetail(
  id: string | null,
  shards: number,
): LibraryDetail | null | 'failed' {
  const [detail, setDetail] = useState<LibraryDetail | null | 'failed'>(null)
  const current = useRef(id)
  useEffect(() => {
    current.current = id
    setDetail(null)
    if (!id) return
    loadShard(libraryShard(id, shards))
      .then((s) => {
        if (current.current === id) setDetail(s[id] ?? { who: [], top: [] })
      })
      .catch(() => {
        if (current.current === id) setDetail('failed')
      })
  }, [id, shards])
  return detail
}

/** The members who tweeted about a work, as overlapping avatars. */
export function MemberAvatars({
  detail,
  members,
  max = 16,
}: {
  detail: LibraryDetail
  members: number
  max?: number
}) {
  const shown = detail.who.slice(0, max)
  const more = members - shown.length
  return (
    <div className="flex flex-wrap items-center gap-y-1">
      <span className="flex -space-x-1.5">
        {shown.map((u, i) => (
          <Link
            key={u}
            href={userProfileHref(u)}
            title={`@${u}`}
            aria-label={`@${u}`}
            className="rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5"
          >
            <TweetAvatar
              tweet={{ id: `who-${u}`, username: u, avatar: detail.wa?.[i] || null }}
              size={26}
            />
          </Link>
        ))}
      </span>
      {more > 0 && (
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          +{more.toLocaleString()} more
        </span>
      )}
    </div>
  )
}

type ExternalParent = { t: string; u: string; n: string; av: string; x: string; f: number; c: number }

const externalParents = new Map<string, Promise<LibraryTweet | null>>()

/** Reply parents outside the archive come from X's embed API at render time
 * only, through the same cached route CA Tube uses. */
function useExternalParent(id: string | undefined): LibraryTweet | null | undefined {
  const [parent, setParent] = useState<LibraryTweet | null | undefined>(id ? undefined : null)
  useEffect(() => {
    if (!id) return
    if (!externalParents.has(id)) {
      externalParents.set(
        id,
        fetch(`/api/syndication/tweet/${id}`)
          .then((r) => (r.ok ? r.json() : { tweet: null }))
          .then(({ tweet: p }: { tweet: ExternalParent | null }) =>
            p ? { i: p.t, u: p.u, n: p.n, a: p.av, x: p.x, f: p.f, c: p.c } : null,
          )
          .catch(() => null),
      )
    }
    let live = true
    externalParents.get(id)!.then((p) => live && setParent(p))
    return () => {
      live = false
    }
  }, [id])
  return parent
}

function LibraryTweetItem({ t }: { t: LibraryTweet }) {
  const external = useExternalParent(t.p ? undefined : t.rt)
  const parent = t.p ?? external
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      {parent && (
        <div className="relative">
          <div className="opacity-75">
            <TweetCard
              tweet={libraryTweetToPortal(parent)}
              compact
              collapsible
              constrainMedia
              showDate
              quotedTweetDisplay="summary"
            />
          </div>
          {/* Thread line from the parent's avatar down to the reply's
              (TweetCard's compact avatar: 34px at 17px from the left). */}
          <span
            aria-hidden="true"
            className="absolute -bottom-3 left-[33px] top-[3.25rem] z-10 w-0.5 rounded-full bg-muted-foreground/40"
          />
        </div>
      )}
      {!parent && t.rt && external === undefined && (
        <div className="mx-3 mt-3 h-10 animate-pulse rounded-lg bg-muted" />
      )}
      {!parent && t.rt && external === null && t.ru && (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Replying to @{t.ru}
        </p>
      )}
      <TweetCard
        tweet={libraryTweetToPortal(t)}
        compact
        collapsible
        constrainMedia
        showDate
        showExternalLink
        quotedTweetDisplay="summary"
      />
    </li>
  )
}

/** Tweets about a work; a reply shows the tweet it answers above it. */
export function LibraryTweets({ tweets }: { tweets: LibraryTweet[] }) {
  return (
    <ul className="space-y-2">
      {tweets.map((t) => (
        <LibraryTweetItem key={t.i} t={t} />
      ))}
    </ul>
  )
}
