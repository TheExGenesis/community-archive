'use client'

import { useState, type FormEvent, type RefObject } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  Info,
  Plus,
  RotateCcw,
  Star,
  X,
} from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { getSmallAvatarUrl } from '@/lib/avatar'
import { formatNumber } from '@/lib/formatNumber'
import { bangerPortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import { tweetPermalinkHref } from '@/lib/navigation'
import { parseProfileTweetId } from '@/lib/profileTweetLink'
import type { ProfileBangerSort } from '@/lib/metaTwitter/profilePagination'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  BangerTweet,
} from '@/lib/metaTwitter/types'

export const BANGER_SCORE_EXPLANATION =
  'Banger score is the number of archived quote posts from Community Archive members, excluding self-quotes.'

const personHue = (handle: string) => {
  let hue = 0
  for (let index = 0; index < handle.length; index += 1) {
    hue = (hue * 31 + handle.charCodeAt(index)) % 360
  }
  return hue
}

const sharesFeaturedGroup = (
  left: { curation?: { is_featured: boolean } } | undefined,
  right: { curation?: { is_featured: boolean } } | undefined,
) =>
  Boolean(left?.curation?.is_featured) === Boolean(right?.curation?.is_featured)

export function Workspace({
  avatarUrl,
  contextTitle,
  tweets,
  bangersAvailable,
  bangersLoading,
  media,
  mediaCount,
  people,
  peopleTitle,
  mediaLoading,
  mediaFailed,
  onRetryMedia,
  peopleLoading,
  peopleFailed,
  onRetryPeople,
  sort,
  onSortChange,
  hasMore,
  loadMoreFailed,
  onLoadMore,
  loadMoreRef,
  returnTo,
  editing = false,
  editSaving = false,
  editError = null,
  undoDismissAvailable = false,
  onUndoDismiss,
  onDismiss,
  onToggleFeature,
  onMove,
  onRestore,
  onAddTweet,
}: {
  avatarUrl: string | null
  contextTitle: string
  tweets: BangerTweet[]
  bangersAvailable: boolean
  bangersLoading: boolean
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
  peopleTitle: string
  mediaLoading: boolean
  mediaFailed: boolean
  onRetryMedia: () => void
  peopleLoading: boolean
  peopleFailed: boolean
  onRetryPeople: () => void
  sort: ProfileBangerSort
  onSortChange: (sort: ProfileBangerSort) => void
  hasMore: boolean
  loadMoreFailed: boolean
  onLoadMore: () => void
  loadMoreRef: RefObject<HTMLDivElement>
  returnTo: string
  editing?: boolean
  editSaving?: boolean
  editError?: string | null
  undoDismissAvailable?: boolean
  onUndoDismiss?: () => void
  onDismiss?: (section: 'bangers' | 'people', itemId: string) => void
  onToggleFeature?: (section: 'bangers' | 'people', itemId: string) => void
  onMove?: (
    section: 'bangers' | 'people',
    itemId: string,
    direction: -1 | 1,
  ) => void
  onRestore?: (section: 'bangers' | 'people') => void
  onAddTweet?: (tweetId: string) => Promise<boolean>
}) {
  const mediaTiles = media.slice(0, 6)
  const mediaOverflow = Math.max(mediaCount - 6, 0)
  const [tweetReference, setTweetReference] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const submitTweet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tweetId = parseProfileTweetId(tweetReference)
    if (!tweetId) {
      setAddError('Paste an X or Community Archive tweet link.')
      return
    }
    setAddError(null)
    if (await onAddTweet?.(tweetId)) setTweetReference('')
  }

  return (
    <main className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id="profile-bangers-heading" className="text-xl font-extrabold">
            {contextTitle}
          </h2>
          <span className="group relative flex-none">
            <button
              type="button"
              aria-label="How banger score works"
              aria-describedby="profile-banger-score-description"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Info className="h-3 w-3" aria-hidden="true" />
            </button>
            <span
              id="profile-banger-score-description"
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-3rem)] rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            >
              {BANGER_SCORE_EXPLANATION}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => onRestore?.('bangers')}
              disabled={editSaving}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-muted disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restore Bangers
            </button>
          )}
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
      </div>

      {editing && (
        <form
          onSubmit={submitTweet}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            Add one of your archived tweets
            <input
              type="text"
              value={tweetReference}
              onChange={(event) => setTweetReference(event.target.value)}
              placeholder="Paste an X or Community Archive tweet link"
              disabled={editSaving}
              aria-describedby={
                addError ? 'profile-add-tweet-error' : undefined
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={editSaving || tweetReference.trim().length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add to profile
          </button>
          {addError && (
            <span
              id="profile-add-tweet-error"
              role="alert"
              className="text-xs text-destructive sm:basis-full"
            >
              {addError}
            </span>
          )}
        </form>
      )}

      {editError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {editError}
        </div>
      )}

      {undoDismissAvailable && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
        >
          <span>Hidden from your profile.</span>
          <button
            type="button"
            onClick={onUndoDismiss}
            disabled={editSaving}
            className="font-semibold text-primary hover:underline disabled:opacity-60"
          >
            Undo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_280px]">
        <section
          aria-labelledby="profile-bangers-heading"
          className="flex flex-col gap-3"
        >
          {!bangersAvailable && (
            <div className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Bangers are temporarily unavailable. The rest of this profile is
              still here.
            </div>
          )}
          {bangersAvailable && bangersLoading && tweets.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              Loading bangers…
            </div>
          )}
          {bangersAvailable && !bangersLoading && tweets.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
              No posts in this chapter have at least two Community Archive
              quotes yet.
            </div>
          )}

          {tweets.map((tweet, index) => (
            <div
              key={tweet.tweet_id}
              className="relative"
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '0 320px',
              }}
            >
              {tweet.curation?.is_featured && !editing && (
                <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-200">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                  Featured
                </span>
              )}
              {editing && (
                <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    aria-label={`Dismiss banger ${tweet.tweet_id}`}
                    onClick={() => onDismiss?.('bangers', tweet.tweet_id)}
                    disabled={editSaving}
                    className="rounded-full p-1.5 hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${tweet.curation?.is_featured ? 'Unfeature' : 'Feature'} banger ${tweet.tweet_id}`}
                    aria-pressed={tweet.curation?.is_featured === true}
                    onClick={() => onToggleFeature?.('bangers', tweet.tweet_id)}
                    disabled={editSaving}
                    className="rounded-full p-1.5 hover:bg-muted disabled:opacity-50"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${tweet.curation?.is_featured ? 'fill-amber-400 text-amber-500' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move banger ${tweet.tweet_id} up`}
                    onClick={() => onMove?.('bangers', tweet.tweet_id, -1)}
                    disabled={
                      editSaving ||
                      index === 0 ||
                      !sharesFeaturedGroup(tweet, tweets[index - 1])
                    }
                    className="disabled:opacity-35 rounded-full p-1.5 hover:bg-muted"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move banger ${tweet.tweet_id} down`}
                    onClick={() => onMove?.('bangers', tweet.tweet_id, 1)}
                    disabled={
                      editSaving ||
                      index === tweets.length - 1 ||
                      !sharesFeaturedGroup(tweet, tweets[index + 1])
                    }
                    className="disabled:opacity-35 rounded-full p-1.5 hover:bg-muted"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
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
            {mediaLoading ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Loading media…
              </div>
            ) : mediaFailed ? (
              <button
                type="button"
                onClick={onRetryMedia}
                className="w-full rounded-md border border-dashed border-border p-4 text-center text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Retry media
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
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3
                id="profile-people-heading"
                className="text-[15px] font-extrabold"
              >
                {peopleTitle}
              </h3>
              {editing && (
                <button
                  type="button"
                  onClick={() => onRestore?.('people')}
                  disabled={editSaving}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Restore
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {peopleLoading && (
                <div className="text-[13px] text-muted-foreground">
                  Loading people…
                </div>
              )}
              {!peopleLoading && peopleFailed && (
                <button
                  type="button"
                  onClick={onRetryPeople}
                  className="text-left text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Interactions are temporarily unavailable. Retry
                </button>
              )}
              {!peopleLoading && !peopleFailed && people.length === 0 && (
                <div className="text-[13px] text-muted-foreground">
                  No interactions found in this chapter.
                </div>
              )}
              {people.map((person, index) => {
                const avatarUrl = getSmallAvatarUrl(person.avatar_media_url)
                const content = (
                  <div className="flex items-center gap-2.5 pr-1">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        sizes="36px"
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
                    <div className="min-w-0 flex-1 text-[13px] leading-[1.3]">
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
                    {person.curation?.is_featured && !editing && (
                      <Star
                        className="h-3.5 w-3.5 flex-none fill-amber-400 text-amber-500"
                        aria-label="Featured person"
                      />
                    )}
                  </div>
                )
                const linkedContent = person.in_archive ? (
                  <Link
                    href={`/user/${person.user_id}`}
                    className="block rounded-lg hover:bg-muted"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )
                return (
                  <div key={person.user_id} className="relative">
                    {linkedContent}
                    {editing && (
                      <div className="mt-1 flex items-center justify-end gap-1 border-t border-dashed border-border/70 pt-1">
                        <button
                          type="button"
                          aria-label={`Dismiss @${person.screen_name}`}
                          onClick={() => onDismiss?.('people', person.user_id)}
                          disabled={editSaving}
                          className="rounded-full p-1 hover:bg-muted disabled:opacity-50"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${person.curation?.is_featured ? 'Unfeature' : 'Feature'} @${person.screen_name}`}
                          aria-pressed={person.curation?.is_featured === true}
                          onClick={() =>
                            onToggleFeature?.('people', person.user_id)
                          }
                          disabled={editSaving}
                          className="rounded-full p-1 hover:bg-muted disabled:opacity-50"
                        >
                          <Star
                            className={`h-3 w-3 ${person.curation?.is_featured ? 'fill-amber-400 text-amber-500' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move @${person.screen_name} up`}
                          onClick={() => onMove?.('people', person.user_id, -1)}
                          disabled={
                            editSaving ||
                            index === 0 ||
                            !sharesFeaturedGroup(person, people[index - 1])
                          }
                          className="disabled:opacity-35 rounded-full p-1 hover:bg-muted"
                        >
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move @${person.screen_name} down`}
                          onClick={() => onMove?.('people', person.user_id, 1)}
                          disabled={
                            editSaving ||
                            index === people.length - 1 ||
                            !sharesFeaturedGroup(person, people[index + 1])
                          }
                          className="disabled:opacity-35 rounded-full p-1 hover:bg-muted"
                        >
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
