'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { formatNumber } from '@/lib/formatNumber'
import { bangerPortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  BangerTweet,
} from '@/lib/metaTwitter/types'

type SortMode = 'quotes' | 'likes' | 'newest'

const PAGE_SIZE = 12

const personHue = (handle: string) => {
  let hue = 0
  for (let index = 0; index < handle.length; index += 1) {
    hue = (hue * 31 + handle.charCodeAt(index)) % 360
  }
  return hue
}

export function Workspace({
  avatarUrl,
  contextTitle,
  contextDesc,
  tweets,
  bangersAvailable,
  media,
  mediaCount,
  people,
  peopleTitle,
}: {
  avatarUrl: string | null
  contextTitle: string
  contextDesc: string
  tweets: BangerTweet[]
  bangersAvailable: boolean
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  peopleTitle: string
}) {
  const [sort, setSort] = useState<SortMode>('quotes')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const orderedTweets = useMemo(() => {
    const ordered = [...tweets]
    if (sort === 'likes') {
      return ordered.sort(
        (left, right) =>
          right.favorite_count - left.favorite_count ||
          right.quote_count - left.quote_count,
      )
    }
    if (sort === 'newest') {
      return ordered.sort(
        (left, right) =>
          right.created_at.localeCompare(left.created_at) ||
          right.quote_count - left.quote_count,
      )
    }
    return ordered.sort(
      (left, right) =>
        right.quote_count - left.quote_count ||
        right.quoting_accounts - left.quoting_accounts ||
        right.created_at.localeCompare(left.created_at),
    )
  }, [sort, tweets])

  const visibleTweets = orderedTweets.slice(0, visibleCount)
  const mediaTiles = media.slice(0, 6)
  const mediaOverflow = Math.max(mediaCount - 6, 0)

  return (
    <main className="flex min-w-0 flex-col gap-[18px] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold">{contextTitle}</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">
            {contextDesc}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
          <span className="sr-only">Sort bangers</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode)
              setVisibleCount(PAGE_SIZE)
            }}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground"
          >
            <option value="quotes">Sort: Most quoted</option>
            <option value="likes">Sort: Most liked</option>
            <option value="newest">Sort: Newest</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_280px]">
        <section
          aria-labelledby="bangers-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="bangers-heading" className="text-[15px] font-extrabold">
              Bangers
            </h3>
            {bangersAvailable && tweets.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatNumber(tweets.length)} total
              </span>
            )}
          </div>

          {!bangersAvailable && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Bangers are temporarily unavailable. The rest of this profile is
              still here.
            </div>
          )}
          {bangersAvailable && tweets.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              No posts in this chapter have at least two Community Archive
              quotes yet.
            </div>
          )}

          {visibleTweets.map((tweet, index) => (
            <TweetCard
              key={tweet.tweet_id}
              tweet={bangerPortalTweet(tweet, avatarUrl)}
              featuredRank={index + 1}
              clickable={false}
              showDate
              showExternalLink
            />
          ))}

          {visibleCount < orderedTweets.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Show more bangers
            </button>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          <section aria-labelledby="profile-media-heading">
            <h3
              id="profile-media-heading"
              className="mb-2.5 text-[15px] font-extrabold"
            >
              Media
            </h3>
            {mediaTiles.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No media in this chapter
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {mediaTiles.map((item, index) => (
                  <Link
                    key={item.media_url}
                    href={`/tweets/${item.tweet_id}`}
                    className="relative block aspect-square overflow-hidden rounded-md bg-muted"
                  >
                    <Image
                      src={item.media_url}
                      alt=""
                      fill
                      sizes="94px"
                      className="object-cover"
                    />
                    {index === 5 && mediaOverflow > 0 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-semibold text-white">
                        +{formatNumber(mediaOverflow)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="profile-people-heading">
            <h3
              id="profile-people-heading"
              className="mb-2.5 text-[15px] font-extrabold"
            >
              {peopleTitle}
            </h3>
            <div className="flex flex-col gap-2.5">
              {people.length === 0 && (
                <div className="text-[13px] text-muted-foreground">
                  No interactions found in this chapter.
                </div>
              )}
              {people.map((person) => {
                const content = (
                  <div className="flex items-center gap-2.5">
                    {person.avatar_media_url ? (
                      <Image
                        src={person.avatar_media_url}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 flex-none rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-bold text-black/70"
                        style={{
                          background: `hsl(${personHue(person.screen_name)} 45% 80%)`,
                        }}
                      >
                        {person.screen_name.charAt(0).toUpperCase()}
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
                    {content}
                  </Link>
                ) : (
                  <div key={person.screen_name}>{content}</div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
