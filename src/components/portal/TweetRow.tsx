'use client'

import Link from 'next/link'
import { useState } from 'react'
import ImageLightbox from '@/components/ImageLightbox'
import TweetAvatarImage from '@/components/TweetAvatarImage'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PortalMedia, PortalQuotedTweet, PortalTweet } from '@/lib/portal/types'

const HUES = [262, 32, 145, 4, 155, 200, 217, 88, 240, 190, 340, 45, 280, 20]

export const avatarHue = (username: string) => {
  let h = 0
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) >>> 0
  }
  return HUES[h % HUES.length]
}

export const formatCount = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)

export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 90_000) return 'now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export function TweetAvatar({
  tweet,
  size = 34,
}: {
  tweet: Pick<PortalTweet, 'id' | 'username' | 'avatar'>
  size?: number
}) {
  const initials = tweet.username.slice(0, 2).toUpperCase()
  return (
    <Avatar className="flex-shrink-0" style={{ width: size, height: size }}>
      <TweetAvatarImage
        src={tweet.avatar}
        alt=""
        username={tweet.username}
        tweetId={tweet.id}
      />
      <AvatarFallback
        className="text-[12px] font-extrabold text-white"
        style={{ background: `hsl(${avatarHue(tweet.username)},42%,42%)` }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

function imageMedia(media: PortalMedia[] | undefined): PortalMedia[] {
  return (media ?? []).filter(
    (item) => item.type === 'photo' || item.type.startsWith('image/'),
  )
}

function TweetImages({
  media,
  compact,
  label,
}: {
  media: PortalMedia[] | undefined
  compact: boolean
  label: string
}) {
  const images = imageMedia(media)
  if (images.length === 0) return null

  if (compact) {
    return (
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {images.slice(0, 4).map((item, index) => (
          <ImageLightbox
            key={`${item.url}-${index}`}
            src={item.url}
            alt={`${label} ${index + 1}`}
            width={item.width || 1200}
            height={item.height || 800}
            sizes="6rem"
            className="h-16 w-24 flex-none rounded-[4px] border border-zinc-200 bg-zinc-100 dark:border-[#303036] dark:bg-[#202023]"
            imageClassName="h-full w-full object-cover transition-transform hover:scale-[1.02]"
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`mt-2 grid gap-1.5 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
    >
      {images.slice(0, 4).map((item, index) => (
        <ImageLightbox
          key={`${item.url}-${index}`}
          src={item.url}
          alt={`${label} ${index + 1}`}
          width={item.width || 1200}
          height={item.height || 800}
          sizes={
            images.length > 1
              ? '(max-width: 640px) 50vw, 320px'
              : '(max-width: 640px) 100vw, 640px'
          }
          className="max-h-72 rounded-[4px] border border-zinc-200 bg-zinc-100 dark:border-[#303036] dark:bg-[#202023]"
          imageClassName="h-full max-h-72 w-full object-cover transition-transform hover:scale-[1.01]"
        />
      ))}
    </div>
  )
}

function QuotedTweet({
  tweet,
  compact,
}: {
  tweet: PortalQuotedTweet
  compact: boolean
}) {
  if (tweet.isDeleted) {
    return (
      <div className="mt-2 rounded-[4px] border border-dashed border-zinc-300 bg-white px-3 py-2 text-[12px] italic text-zinc-500 dark:border-[#3a3a40] dark:bg-[#18181b] dark:text-[#a7a7b4]">
        Quoted tweet deleted
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-[4px] border border-zinc-200 bg-white p-2.5 dark:border-[#303036] dark:bg-[#18181b]">
      <Link
        href={`/tweets/${tweet.id}`}
        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="flex items-center gap-2">
          <TweetAvatar tweet={tweet} size={compact ? 24 : 28} />
          <div className="min-w-0 text-[12px] leading-tight">
            <span className="font-bold">{tweet.name}</span>{' '}
            <span className="text-zinc-500 dark:text-[#a7a7b4]">
              @{tweet.username} · {relativeTime(tweet.createdAt)}
            </span>
          </div>
        </div>
        <div
          className={`${compact ? 'line-clamp-3' : ''} mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-700 dark:text-[#d9d9de]`}
        >
          {tweet.text}
        </div>
      </Link>
      <TweetImages
        media={tweet.media}
        compact={compact}
        label="Quoted tweet image"
      />
      {!compact && (
        <div className="mt-1.5 flex gap-4 text-[11.5px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          <span>♥ {formatCount(tweet.likes)}</span>
          <span>⇄ {formatCount(tweet.rts)}</span>
        </div>
      )}
    </div>
  )
}

export function TweetRow({
  tweet,
  animate = false,
  compact = false,
  collapsible = false,
  featuredRank,
  showDate = false,
  showArchivedBadge = false,
}: {
  tweet: PortalTweet
  animate?: boolean
  compact?: boolean
  collapsible?: boolean
  featuredRank?: number
  showDate?: boolean
  showArchivedBadge?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const canExpand = collapsible && tweet.text.length > 280
  const href = `/tweets/${tweet.id}`
  const isFeatured = featuredRank !== undefined
  const isTopThree = isFeatured && featuredRank <= 3
  const rowClassName = isFeatured
    ? `relative mt-2 flex min-w-0 gap-3 rounded-lg border px-4 pb-4 pt-5 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:hover:border-brand/60 sm:gap-3.5 sm:px-5 sm:pb-5 sm:pt-6 ${
        isTopThree
          ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/80 via-white to-white dark:border-amber-400/25 dark:from-amber-400/[0.06] dark:via-[#1b1b1e] dark:to-[#1b1b1e]'
          : 'border-zinc-200 bg-white dark:border-[#303036] dark:bg-[#1b1b1e]'
      } ${animate ? 'portal-slide-in' : ''}`
    : `flex gap-3 border-b border-zinc-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23] ${
        animate ? 'portal-slide-in' : ''
      }`

  const tweetContent = (
    <>
      <div className="flex items-baseline gap-2 overflow-hidden">
        <span
          className={`truncate font-bold ${compact ? 'text-[13px]' : 'text-[13.5px]'}`}
        >
          {tweet.name}
        </span>
        <span className="flex-shrink-0 text-[12px] text-zinc-500 dark:text-[#a7a7b4]">
          @{tweet.username} ·{' '}
          {showDate
            ? shortDate(tweet.createdAt)
            : relativeTime(tweet.createdAt)}
        </span>
      </div>
      <div
        className={`mt-0.5 leading-relaxed text-zinc-700 dark:text-[#d9d9de] ${
          compact
            ? 'line-clamp-2 text-[13.5px]'
            : `${isFeatured ? 'text-[14.5px]' : 'text-[14px]'} ${
                canExpand && !isExpanded ? 'line-clamp-5' : ''
              }`
        }`}
      >
        {tweet.text}
      </div>
    </>
  )

  const details = (
    <div className="min-w-0 flex-1">
      <Link
        href={href}
        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {tweetContent}
      </Link>
      {canExpand && (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="mt-1 text-[12px] font-semibold text-brand hover:underline"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
      <TweetImages media={tweet.media} compact={compact} label="Tweet image" />
      {tweet.quotedTweet && (
        <QuotedTweet tweet={tweet.quotedTweet} compact={compact} />
      )}
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {tweet.quoteCount !== undefined && (
            <span
              className={`font-semibold text-brand ${
                isFeatured
                  ? 'border-brand/15 rounded-full border bg-brand/[0.07] px-2 py-0.5'
                  : ''
              }`}
            >
              ✦ {formatCount(tweet.quoteCount)} archive quotes
            </span>
          )}
          <span>♥ {formatCount(tweet.likes)}</span>
          <span>⇄ {formatCount(tweet.rts)}</span>
          {showArchivedBadge && <span className="text-brand">archived</span>}
        </div>
      )}
    </div>
  )

  return (
    <article className={rowClassName}>
      {isFeatured ? (
        <span
          aria-label={`Rank ${featuredRank}`}
          className={`absolute right-4 top-0 -translate-y-1/2 rounded-full border px-2.5 py-1 text-[10.5px] font-extrabold tabular-nums tracking-[0.06em] shadow-sm ${
            isTopThree
              ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-[#2b2418] dark:text-amber-200'
              : 'border-brand/25 bg-blue-50 text-brand dark:bg-[#20283a]'
          }`}
        >
          #{featuredRank}
        </span>
      ) : null}
      <Link href={href} aria-label={`View tweet by @${tweet.username}`}>
        <TweetAvatar tweet={tweet} size={isFeatured ? 38 : 34} />
      </Link>
      {details}
      {compact && (
        <div className="whitespace-nowrap text-[11.5px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          ♥ {formatCount(tweet.likes)}
        </div>
      )}
    </article>
  )
}
