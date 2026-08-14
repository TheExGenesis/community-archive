'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { TweetText } from './TweetText'
import { createBrowserClient } from '@/utils/supabase'
import { formatNumber } from '@/lib/formatNumber'
import type {
  ArchiveTweet,
  ArchiveMediaItem,
  ArchivePerson,
} from '@/lib/metaTwitter/types'

interface CurationState {
  pinned: Record<string, boolean>
  hidden: Record<string, boolean>
  /** Tweet ids manually added to the Hall of Fame via link */
  added: string[]
  /** Explicit ordering for the Curated sort (tweet ids, first = top) */
  order: string[]
}

const EMPTY_CURATION: CurationState = {
  pinned: {},
  hidden: {},
  added: [],
  order: [],
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

/** Accepts x.com/twitter.com status URLs or a raw numeric id. */
const parseTweetId = (input: string): string | null => {
  const trimmed = input.trim()
  if (/^\d{5,25}$/.test(trimmed)) return trimmed
  const match = trimmed.match(
    /(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i,
  )
  return match ? match[1] : null
}

export function Workspace({
  accountId,
  username,
  displayName,
  avatarUrl,
  isOverall,
  contextTitle,
  contextDesc,
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
  const [curation, setCuration] = useState<CurationState>(EMPTY_CURATION)
  const [addedTweets, setAddedTweets] = useState<ArchiveTweet[]>([])
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const storageKey = `meta-twitter-curation:${accountId}`

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setCuration({ ...EMPTY_CURATION, ...JSON.parse(raw) })
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

  /** Fetch a tweet from this account's archive, shaped like the server data. */
  const fetchArchiveTweet = async (
    tweetId: string,
  ): Promise<ArchiveTweet | null> => {
    const supabase = createBrowserClient()
    const { data } = await supabase
      .from('tweets')
      .select(
        'tweet_id, account_id, created_at, full_text, favorite_count, retweet_count, reply_to_username, media:tweet_media ( media_url, media_type, width, height )',
      )
      .eq('tweet_id', tweetId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!data) return null
    return {
      ...data,
      retweet_count: data.retweet_count ?? 0,
      reply_to_username: data.reply_to_username ?? null,
      username,
      account_display_name: displayName,
      avatar_media_url: avatarUrl,
      media: (data.media ?? []) as ArchiveTweet['media'],
    }
  }

  // Restore manually-added tweets that aren't in the server-provided list.
  useEffect(() => {
    const serverIds = new Set(tweets.map((t) => t.tweet_id))
    const missing = curation.added.filter((id) => !serverIds.has(id))
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(fetchArchiveTweet)).then((results) => {
      if (cancelled) return
      setAddedTweets((prev) => {
        const have = new Set(prev.map((t) => t.tweet_id))
        const fresh = results.filter(
          (t): t is ArchiveTweet => !!t && !have.has(t.tweet_id),
        )
        return fresh.length > 0 ? [...prev, ...fresh] : prev
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curation.added, tweets])

  const allTweets = useMemo(() => {
    const seen = new Set<string>()
    return [...tweets, ...addedTweets].filter((t) => {
      if (seen.has(t.tweet_id)) return false
      seen.add(t.tweet_id)
      return true
    })
  }, [tweets, addedTweets])

  // A tweet is in the Hall of Fame if the owner pinned it, or it's a curated
  // default that hasn't been explicitly un-pinned.
  const isPinned = (id: string) =>
    curation.pinned[id] ?? (hofIds.includes(id) || curation.added.includes(id))

  const visibleTweets = useMemo(() => {
    let list = allTweets.filter((t) => !curation.hidden[t.tweet_id])
    if (sort === 'likes') {
      list = [...list].sort((a, b) => b.favorite_count - a.favorite_count)
    } else if (sort === 'newest') {
      list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    } else {
      const orderIndex = (id: string) => {
        const i = curation.order.indexOf(id)
        return i === -1 ? Number.MAX_SAFE_INTEGER : i
      }
      list = [...list].sort(
        (a, b) =>
          orderIndex(a.tweet_id) - orderIndex(b.tweet_id) ||
          Number(isPinned(b.tweet_id)) - Number(isPinned(a.tweet_id)) ||
          b.favorite_count - a.favorite_count,
      )
    }
    return list.slice(0, MAX_TWEETS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTweets, curation, sort, hofIds])

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

  /** Swap a tweet with its neighbor in the current curated view. */
  const moveTweet = (id: string, direction: -1 | 1) => {
    const ids = visibleTweets.map((t) => t.tweet_id)
    const from = ids.indexOf(id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    saveCuration({ ...curation, order: ids })
  }

  const addTweetByLink = async () => {
    setAddError(null)
    const tweetId = parseTweetId(addInput)
    if (!tweetId) {
      setAddError('Paste an x.com or twitter.com tweet link.')
      return
    }
    if (curation.added.includes(tweetId) || hofIds.includes(tweetId)) {
      setAddError('That tweet is already in the Hall of Fame.')
      return
    }
    setAdding(true)
    try {
      const tweet = await fetchArchiveTweet(tweetId)
      if (!tweet) {
        setAddError(`Couldn't find that tweet in @${username}'s archive.`)
        return
      }
      setAddedTweets((prev) => [...prev, tweet])
      saveCuration({
        ...curation,
        added: [...curation.added, tweetId],
        pinned: { ...curation.pinned, [tweetId]: true },
        hidden: { ...curation.hidden, [tweetId]: false },
      })
      setAddInput('')
    } finally {
      setAdding(false)
    }
  }

  const mediaTiles = media.slice(0, 6)
  const mediaOverflow = Math.max(mediaCount - 5, 0)
  const canReorder = edit && sort === 'curated'

  return (
    <main className="flex min-w-0 flex-col gap-[18px] px-6 py-5">
      {/* Context header with sort + edit controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xl font-extrabold">{contextTitle}</div>
          {contextDesc && (
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {contextDesc}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground"
          >
            <option value="curated">Sort: Curated</option>
            <option value="likes">Sort: Most liked</option>
            <option value="newest">Sort: Newest</option>
          </select>
          {isOwner && (
            <button
              onClick={() => setEdit(!edit)}
              className={`rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold ${
                edit
                  ? 'bg-foreground text-background'
                  : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {edit ? 'Done editing' : '✎ Edit archive'}
            </button>
          )}
        </div>
      </div>

      {/* Add-to-Hall-of-Fame by tweet link (owner, Overall view) */}
      {edit && isOverall && (
        <div className="rounded-[10px] border border-dashed border-border px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={addInput}
              onChange={(e) => {
                setAddInput(e.target.value)
                setAddError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && addTweetByLink()}
              placeholder="Paste a tweet link to add it to the Hall of Fame — e.g. https://x.com/christineist/status/…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] placeholder:text-muted-foreground/70"
            />
            <button
              onClick={addTweetByLink}
              disabled={adding || addInput.trim() === ''}
              className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-semibold text-background disabled:opacity-50"
            >
              {adding ? 'Adding…' : '⭐ Add'}
            </button>
          </div>
          {addError && (
            <div className="mt-1.5 text-[13px] text-[hsl(var(--destructive))]">
              {addError}
            </div>
          )}
        </div>
      )}

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
          {visibleTweets.map((tweet, index) => (
            <div
              key={tweet.tweet_id}
              className="rounded-xl border border-border px-4 py-3.5"
            >
              <div className="flex gap-2.5">
                {canReorder && (
                  <div className="flex flex-col justify-center gap-1">
                    <button
                      title="Move up"
                      onClick={() => moveTweet(tweet.tweet_id, -1)}
                      disabled={index === 0}
                      className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      title="Move down"
                      onClick={() => moveTweet(tweet.tweet_id, 1)}
                      disabled={index === visibleTweets.length - 1}
                      className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                )}
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
