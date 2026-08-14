'use client'

import type { RefObject } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { formatNumber } from '@/lib/formatNumber'
import { bangerPortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import { tweetPermalinkHref } from '@/lib/navigation'
import type { ProfileBangerSort } from '@/lib/metaTwitter/profilePagination'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  BangerTweet,
} from '@/lib/metaTwitter/types'

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
  bangersLoading,
  media,
  mediaCount,
  people,
  peopleTitle,
  sidebarLoading,
  sidebarFailed,
  onRetrySidebar,
  sort,
  onSortChange,
  hasMore,
  loadMoreFailed,
  onLoadMore,
  loadMoreRef,
  returnTo,
}: {
  avatarUrl: string | null
  contextTitle: string
  contextDesc: string
  tweets: BangerTweet[]
  bangersAvailable: boolean
  bangersLoading: boolean
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  peopleTitle: string
  sidebarLoading: boolean
  sidebarFailed: boolean
  onRetrySidebar: () => void
  sort: ProfileBangerSort
  onSortChange: (sort: ProfileBangerSort) => void
  hasMore: boolean
  loadMoreFailed: boolean
  onLoadMore: () => void
  loadMoreRef: RefObject<HTMLDivElement>
  returnTo: string
}) {
  const mediaTiles = media.slice(0, 6)
  const mediaOverflow = Math.max(mediaCount - 6, 0)

  return (
    <main className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="profile-bangers-heading" className="text-xl font-extrabold">
            {contextTitle}
          </h2>
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            {contextDesc}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
          <span className="sr-only">Sort bangers</span>
          <select
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as ProfileBangerSort)
            }
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground"
          >
            <option value="quotes">Sort: Most quoted</option>
            <option value="likes">Sort: Most liked</option>
            <option value="newest">Sort: Newest</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_280px]">
        <section
          aria-labelledby="profile-bangers-heading"
          className="flex flex-col gap-3"
        >
          {!bangersAvailable && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Bangers are temporarily unavailable. The rest of this profile is
              still here.
            </div>
          )}
          {bangersAvailable && bangersLoading && tweets.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Loading bangers…
            </div>
          )}
          {bangersAvailable && !bangersLoading && tweets.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              No posts in this chapter have at least two Community Archive
              quotes yet.
            </div>
          )}

          {tweets.map((tweet, index) => (
            <div
              key={tweet.tweet_id}
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '0 320px',
              }}
            >
              <TweetCard
                tweet={bangerPortalTweet(tweet, avatarUrl)}
                featuredRank={index + 1}
                clickable={false}
                showDate
                showExternalLink
                origin="profile"
                returnTo={returnTo}
              />
            </div>
          ))}

          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-1">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={bangersLoading}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-60"
              >
                {bangersLoading
                  ? 'Loading more bangers…'
                  : loadMoreFailed
                    ? 'Retry loading bangers'
                    : 'Load more bangers'}
              </button>
            </div>
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
            {sidebarLoading ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Loading media…
              </div>
            ) : sidebarFailed ? (
              <button
                type="button"
                onClick={onRetrySidebar}
                className="w-full rounded-md border border-dashed border-border p-4 text-center text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Retry media and people
              </button>
            ) : mediaTiles.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No media in this chapter
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {mediaTiles.map((item, index) => (
                  <Link
                    key={item.media_url}
                    href={tweetPermalinkHref(
                      item.tweet_id,
                      'profile',
                      returnTo,
                    )}
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
              {sidebarLoading && (
                <div className="text-[13px] text-muted-foreground">
                  Loading people…
                </div>
              )}
              {!sidebarLoading && sidebarFailed && (
                <div className="text-[13px] text-muted-foreground">
                  Interactions are temporarily unavailable.
                </div>
              )}
              {!sidebarLoading && !sidebarFailed && people.length === 0 && (
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
