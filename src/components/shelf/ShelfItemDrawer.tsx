'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Check, Link as LinkIcon, Play } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
import {
  SHELF_COVER_SIZE,
  SHELF_MARK_LABEL,
  shelfOwnerName,
  shelfHost,
  shelfSpan,
  shelfVerb,
  youtubeId,
} from '@/lib/shelf/labels'
import { hasCover } from '@/lib/shelf/bento'
import type { ShelfItem, ShelfPerson } from '@/lib/shelf/types'
import { ShelfCover } from './ShelfCover'
import { ShelfFacepile } from './ShelfFacepile'
import { ShelfMarks } from './ShelfMarks'

type Loaded<T> =
  | { state: 'loading' }
  | ({ state: 'ready' } & T)
  | { state: 'error'; message: string }
type Evidence = Loaded<{ tweets: PortalTweet[]; total: number }>
type EchoTweet = PortalTweet & { match: 'url' | 'title' }
type Echoes = Loaded<{
  tweets: EchoTweet[]
  people: ShelfPerson[]
  total: number
}>

/**
 * Load a drawer section once per item, keeping each response for the life
 * of the drawer so reopening a work is instant.
 */
function useItemLoad<T extends object>(
  url: string | null,
  parse: (body: unknown) => T | null,
  fallback: string,
): Loaded<T> {
  const cache = useRef(new Map<string, Loaded<T>>())
  const [value, setValue] = useState<Loaded<T>>({ state: 'loading' })
  useEffect(() => {
    if (!url) return
    const cached = cache.current.get(url)
    if (cached) {
      setValue(cached)
      return
    }
    let live = true
    setValue({ state: 'loading' })
    fetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        const parsed = response.ok ? parse(body) : null
        if (!parsed)
          throw new Error(
            typeof body?.error === 'string' ? body.error : fallback,
          )
        const next = { state: 'ready', ...parsed } as Loaded<T>
        cache.current.set(url, next)
        if (live) setValue(next)
      })
      .catch((error: Error) => {
        if (live) setValue({ state: 'error', message: error.message })
      })
    return () => {
      live = false
    }
    // parse and fallback are stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return value
}

const parseEvidence = (body: unknown) => {
  const b = body as { tweets?: unknown; total?: number } | null
  return Array.isArray(b?.tweets)
    ? {
        tweets: b!.tweets as PortalTweet[],
        total: b!.total ?? b!.tweets.length,
      }
    : null
}
const parseEchoes = (body: unknown) => {
  const b = body as {
    tweets?: unknown
    people?: unknown
    total?: number
  } | null
  return Array.isArray(b?.tweets) && Array.isArray(b?.people)
    ? {
        tweets: b!.tweets as EchoTweet[],
        people: b!.people as ShelfPerson[],
        total: b!.total ?? b!.people.length,
      }
    : null
}

function TweetsSkeleton() {
  return (
    <div className="mt-3 space-y-3">
      {[0, 1].map((n) => (
        <div key={n} className="h-24 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

/** Copy a work's link, or post it on X. */
function ShareRow({ href, text }: { href: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const absolute = () => new URL(href, window.location.origin).toString()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', absolute())
    }
  }
  const button =
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={button}>
        {copied ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <LinkIcon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <button
        type="button"
        onClick={() =>
          window.open(
            `https://x.com/intent/post?${new URLSearchParams({ text, url: absolute() })}`,
            '_blank',
            'noopener,noreferrer',
          )
        }
        className={button}
      >
        Post on X
      </button>
    </div>
  )
}

/**
 * One work: its marks, the member's tweets about it, and the other members
 * who tweeted about it too.
 */
/**
 * A YouTube work, playable in the drawer. Until someone presses play it is only
 * the thumbnail, so opening the drawer loads nothing from YouTube; then the
 * privacy-enhanced player takes its place.
 */
function YouTubePlayer({
  id,
  title,
  poster,
}: {
  id: string
  title: string
  poster: string | null
}) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="border-b border-border p-5">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
            className="group absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {poster ? (
              <Image
                unoptimized
                src={poster}
                alt=""
                fill
                sizes="480px"
                className="object-cover"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/25 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none">
                <Play
                  className="ml-0.5 h-6 w-6 fill-white text-white"
                  strokeWidth={0}
                />
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

export function ShelfItemDrawer({
  accountId,
  item,
  onClose,
  actions,
  people = {},
  ownerName,
  shareHref,
}: {
  accountId: string
  item: ShelfItem | null
  onClose: () => void
  actions?: ReactNode
  people?: Record<string, ShelfPerson>
  ownerName?: string
  /** The work's own page; shows Copy link and Post on X. */
  shareHref?: string | null
}) {
  const query = item
    ? new URLSearchParams({ account_id: accountId, key: item.key }).toString()
    : null
  const evidence: Evidence = useItemLoad(
    query && `/api/shelf/evidence?${query}`,
    parseEvidence,
    'Source tweets are unavailable. Try again.',
  )
  const echoes: Echoes = useItemLoad(
    query && item?.echoAccountIds.length ? `/api/shelf/echoes?${query}` : null,
    parseEchoes,
    'Tweets from other members are unavailable. Try again.',
  )
  const echoPeople = {
    ...people,
    ...(echoes.state === 'ready'
      ? Object.fromEntries(echoes.people.map((p) => [p.accountId, p]))
      : {}),
  }
  const owner = shelfOwnerName(ownerName)

  const video = item ? youtubeId(item.url) : null
  const size = item ? SHELF_COVER_SIZE[item.row] : { w: 0, h: 0 }
  const scale = item ? Math.min(1.25, 200 / size.h) : 1
  const host = item ? shelfHost(item.url) : null

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-card p-0 sm:max-w-lg"
      >
        {item ? (
          <div className="flex flex-col">
            <div className="flex gap-4 border-b border-border p-5 pr-12">
              {/* A video plays below the title instead of showing as a cover. */}
              {video ? null : (
                <ShelfCover
                  item={item}
                  width={Math.round(size.w * Math.min(scale, 1))}
                  height={Math.round(size.h * Math.min(scale, 1))}
                />
              )}
              <div className="min-w-0 self-end">
                <SheetTitle className="text-2xl font-semibold leading-tight [overflow-wrap:anywhere] [text-wrap:balance]">
                  {item.label}
                </SheetTitle>
                {item.creator ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.creator}
                  </p>
                ) : null}
                <SheetDescription className="mt-2 text-xs text-muted-foreground">
                  {shelfVerb(item) ? (
                    <span className="font-semibold text-foreground">
                      {shelfVerb(item)} ·{' '}
                    </span>
                  ) : null}
                  {item.medium.charAt(0).toUpperCase() + item.medium.slice(1)},
                  tweeted about {shelfSpan(item)}
                </SheetDescription>
                {host ? (
                  <a
                    href={item.url!}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Open on {host}
                  </a>
                ) : null}
                {shareHref ? (
                  <div className="mt-4">
                    <ShareRow
                      href={shareHref}
                      text={
                        owner
                          ? `${item.label}, on ${owner}'s shelf`
                          : item.label
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {video ? (
              <YouTubePlayer
                key={video}
                id={video}
                title={item.label}
                poster={hasCover(item) ? item.coverPath : null}
              />
            ) : null}

            {item.marks.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-sm">
                {item.marks.map((mark) => (
                  <li key={mark} className="flex items-center gap-1.5">
                    <ShelfMarks marks={[mark]} />
                    {SHELF_MARK_LABEL[mark]}
                  </li>
                ))}
              </ul>
            ) : null}

            {actions ? (
              <div className="border-b border-border px-5 py-3">{actions}</div>
            ) : null}

            <section className="px-5 pb-6 pt-5" aria-live="polite">
              <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                {owner ? `${owner}'s tweets` : 'Tweets'}
                <span className="font-normal tabular-nums text-muted-foreground">
                  {item.evidenceTweetIds.length}
                </span>
              </h3>
              {evidence.state === 'loading' ? (
                <TweetsSkeleton />
              ) : evidence.state === 'error' ? (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {evidence.message}
                </p>
              ) : evidence.tweets.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  These tweets are not in the archive right now.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {evidence.tweets.map((tweet) => (
                    <TweetCard
                      key={tweet.id}
                      tweet={tweet}
                      showDate
                      collapsible
                      constrainMedia
                      origin="profile"
                    />
                  ))}
                  {evidence.total > evidence.tweets.length ? (
                    <p className="text-xs text-muted-foreground">
                      Showing the {evidence.tweets.length} most recent of{' '}
                      {evidence.total}.
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {item.echoAccountIds.length ? (
              <section
                className="border-t border-border px-5 pb-8 pt-5"
                aria-live="polite"
              >
                <h3 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold">
                  <span>
                    Also tweeted about by {item.echoAccountIds.length}{' '}
                    {item.echoAccountIds.length === 1 ? 'member' : 'members'}
                  </span>
                  <ShelfFacepile
                    ids={item.echoAccountIds}
                    people={echoPeople}
                    max={8}
                    size={26}
                    linked
                  />
                </h3>
                {echoes.state === 'loading' ? (
                  <TweetsSkeleton />
                ) : echoes.state === 'error' ? (
                  <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {echoes.message}
                  </p>
                ) : echoes.tweets.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Their tweets are not in the archive right now.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {echoes.tweets.map((tweet) => (
                      <div key={tweet.id}>
                        <p className="mb-1.5 text-xs text-muted-foreground">
                          {tweet.match === 'url'
                            ? 'Linked the same page'
                            : 'Named it'}
                        </p>
                        <TweetCard
                          tweet={tweet}
                          showDate
                          collapsible
                          constrainMedia
                          origin="profile"
                        />
                      </div>
                    ))}
                    {echoes.total > echoes.tweets.length ? (
                      <p className="text-xs text-muted-foreground">
                        One tweet each from {echoes.tweets.length} of the{' '}
                        {echoes.total} members.
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
