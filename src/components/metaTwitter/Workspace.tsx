'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { TweetText } from './TweetText'
import { formatNumber } from '@/lib/formatNumber'
import type {
  ArchiveTweet,
  ArchiveMediaItem,
  ArchivePerson,
} from '@/lib/metaTwitter/types'

export interface WorkspacePill {
  label: string
  slug: string
  href: string
  active: boolean
}

interface CurationState {
  pinned: Record<string, boolean>
  hidden: Record<string, boolean>
}

type SortMode = 'curated' | 'likes' | 'newest'

const MAX_TWEETS = 24

const tweetDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

const personHue = (handle: string) => {
  let h = 0
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 360
  return h
}

export function Workspace({
  accountId,
  username,
  displayName,
  avatarUrl,
  isOverall,
  contextTitle,
  contextDesc,
  pills,
  tweets,
  hofIds,
  media,
  mediaCount,
  people,
  peopleTitle,
}: {
  accountId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isOverall: boolean
  contextTitle: string
  contextDesc: string | null
  pills: WorkspacePill[]
  tweets: ArchiveTweet[]
  hofIds: string[]
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  peopleTitle: string
}) {
  const { userMetadata } = useAuthAndArchive()
  const isOwner =
    userMetadata?.provider_id === accountId ||
    process.env.NODE_ENV === 'development'

  const [sort, setSort] = useState<SortMode>('curated')
  const [edit, setEdit] = useState(false)
  const [curation, setCuration] = useState<CurationState>({
    pinned: {},
    hidden: {},
  })
  const storageKey = `meta-twitter-curation:${accountId}`

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setCuration(JSON.parse(raw))
    } catch {
      /* corrupted state — start fresh */
    }
  }, [storageKey])

  const saveCuration = (next: CurationState) => {
    setCuration(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  // A tweet is in the Hall of Fame if the owner pinned it, or it's a curated
  // default that hasn't been explicitly un-pinned.
  const isPinned = (id: string) => curation.pinned[id] ?? hofIds.includes(id)

  const visibleTweets = useMemo(() => {
    let list = tweets.filter((t) => !curation.hidden[t.tweet_id])
    if (sort === 'likes') {
      list = [...list].sort((a, b) => b.favorite_count - a.favorite_count)
    } else if (sort === 'newest') {
      list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    } else {
      list = [...list].sort(
        (a, b) =>
          Number(isPinned(b.tweet_id)) - Number(isPinned(a.tweet_id)) ||
          b.favorite_count - a.favorite_count,
      )
    }
    return list.slice(0, MAX_TWEETS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweets, curation, sort, hofIds])

  const hiddenCount = Object.values(curation.hidden).filter(Boolean).length

  const togglePin = (id: string) =>
    saveCuration({
      ...curation,
      pinned: { ...curation.pinned, [id]: !isPinned(id) },
    })
  const hideTweet = (id: string) =>
    saveCuration({
      ...curation,
      hidden: { ...curation.hidden, [id]: true },
    })
  const restoreAll = () => saveCuration({ ...curation, hidden: {} })

  const mediaTiles = media.slice(0, 6)
  const mediaOverflow = Math.max(mediaCount - 5, 0)

  return (
    <main className="flex min-w-0 flex-col gap-[18px] px-6 py-5">
      {/* Context header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold">{contextTitle}</div>
          {contextDesc && (
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {contextDesc}
            </div>
          )}
        </div>
        {isOwner && (
          <button
            onClick={() => setEdit(!edit)}
            className={`shrink-0 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold ${
              edit
                ? 'bg-foreground text-background'
                : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {edit ? 'Done editing' : '✎ Edit archive'}
          </button>
        )}
      </div>

      {/* Pills + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {pills.map((pill) => (
          <Link
            key={pill.slug}
            href={pill.href}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
              pill.active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            {pill.label}
          </Link>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="ml-auto rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground"
        >
          <option value="curated">Sort: Curated</option>
          <option value="likes">Sort: Most liked</option>
          <option value="newest">Sort: Newest</option>
        </select>
      </div>

      {/* Hidden banner */}
      {edit && hiddenCount > 0 && (
        <div className="flex items-center justify-between rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <span>
            {hiddenCount} tweet{hiddenCount === 1 ? '' : 's'} hidden from this
            archive
          </span>
          <button onClick={restoreAll} className="font-bold text-foreground">
            Restore all
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_280px]">
        {/* Top tweets */}
        <div className="flex flex-col gap-3">
          <div className="text-[15px] font-extrabold">Top tweets</div>
          {visibleTweets.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Nothing here yet — everything in this chapter was hidden or
              filtered out.
            </div>
          )}
          {visibleTweets.map((tweet) => (
            <div
              key={tweet.tweet_id}
              className="rounded-xl border border-border px-4 py-3.5"
            >
              <div className="flex gap-2.5">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-muted font-bold">
                    {displayName[0]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <b>{displayName}</b>
                    <span className="text-muted-foreground">
                      @{username} ·{' '}
                      <Link
                        href={`/tweets/${tweet.tweet_id}`}
                        className="hover:underline"
                      >
                        {tweetDate(tweet.created_at)}
                      </Link>
                    </span>
                    {isPinned(tweet.tweet_id) && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                        ⭐ Hall of Fame
                      </span>
                    )}
                    {edit && (
                      <span className="ml-auto inline-flex gap-1.5">
                        <button
                          title="Add to / remove from Hall of Fame"
                          onClick={() => togglePin(tweet.tweet_id)}
                          className="rounded-lg border border-border bg-card px-2 py-0.5 text-[13px]"
                        >
                          {isPinned(tweet.tweet_id) ? '★' : '☆'}
                        </button>
                        <button
                          title="Hide from archive"
                          onClick={() => hideTweet(tweet.tweet_id)}
                          className="rounded-lg border border-border bg-card px-2 py-0.5 text-[13px] text-muted-foreground"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </div>
                  <TweetText
                    text={tweet.full_text}
                    hasMedia={tweet.media.some((m) => m.media_type === 'photo')}
                  />
                  {tweet.media.length > 0 && (
                    <div
                      className={`mt-2 grid gap-1 ${tweet.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
                    >
                      {tweet.media
                        .filter((m) => m.media_type === 'photo')
                        .slice(0, 4)
                        .map((m) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={m.media_url}
                            src={m.media_url}
                            alt=""
                            loading="lazy"
                            className="max-h-[420px] w-full rounded-lg border border-border object-cover"
                          />
                        ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-5 text-[13px] text-muted-foreground">
                    <span>🔁 {formatNumber(tweet.retweet_count ?? 0)}</span>
                    <span>♥ {formatNumber(tweet.favorite_count)}</span>
                    <a
                      href={`https://x.com/${username}/status/${tweet.tweet_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto hover:underline"
                    >
                      View on X ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right rail: media + people */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2.5 text-[15px] font-extrabold">Media</div>
            {mediaTiles.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No media in this chapter
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {mediaTiles.map((item, i) => (
                  <Link
                    key={item.media_url}
                    href={`/tweets/${item.tweet_id}`}
                    className="relative block aspect-square overflow-hidden rounded-md bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${item.media_url}?name=small`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {i === 5 && mediaOverflow > 1 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-semibold text-white">
                        +{formatNumber(mediaOverflow)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2.5 text-[15px] font-extrabold">
              {peopleTitle}
            </div>
            <div className="flex flex-col gap-2.5">
              {people.length === 0 && (
                <div className="text-[13px] text-muted-foreground">
                  No interactions found in this chapter.
                </div>
              )}
              {people.map((person) => {
                const inner = (
                  <div className="flex items-center gap-2.5">
                    {person.avatar_media_url ? (
                      <img
                        src={person.avatar_media_url}
                        alt=""
                        className="h-9 w-9 flex-none rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-bold text-black/70"
                        style={{
                          background: `hsl(${personHue(person.screen_name)} 45% 80%)`,
                        }}
                      >
                        {person.screen_name[0].toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 text-[13px] leading-[1.3]">
                      <b>{person.name ?? person.screen_name}</b>{' '}
                      <span className="text-muted-foreground">
                        @{person.screen_name}
                      </span>
                      <br />
                      <span className="text-muted-foreground">
                        {person.interactions} interaction
                        {person.interactions === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                )
                return person.in_archive ? (
                  <Link
                    key={person.screen_name}
                    href={`/user/${person.user_id}`}
                    className="rounded-lg hover:bg-muted"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={person.screen_name}>{inner}</div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
