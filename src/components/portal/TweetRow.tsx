'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import ImageLightbox from '@/components/ImageLightbox'
import TweetAvatarImage from '@/components/TweetAvatarImage'
import {
  tweetPermalinkHref,
  userProfileHref,
  type TweetOrigin,
} from '@/lib/navigation'
import { decodeTweetText } from '@/lib/tweetText'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PortalMedia, PortalQuotedTweet, PortalTweet } from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'

const HUES = [262, 32, 145, 4, 155, 200, 217, 88, 240, 190, 340, 45, 280, 20]
const FEATURED_CARD_HOVER =
  'transition-[transform,border-color,box-shadow] duration-100 ease-out hover:-translate-y-0.5 hover:border-[#d4d4d7]/75 hover:shadow-[0_3px_9px_rgba(24,24,27,0.08)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:hover:border-[#404046]/80 dark:hover:shadow-[0_3px_9px_rgba(0,0,0,0.22)]'

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
  summary,
  noClamp,
  origin,
  returnTo,
  onOpen,
}: {
  tweet: PortalQuotedTweet
  compact: boolean
  summary: boolean
  noClamp: boolean
  origin?: TweetOrigin
  returnTo?: string
  onOpen: () => void
}) {
  if (tweet.isDeleted) {
    return (
      <div className="mt-2 rounded-[4px] border border-dashed border-zinc-300 bg-white px-3 py-2 text-[12px] italic text-zinc-500 dark:border-[#3a3a40] dark:bg-[#18181b] dark:text-[#a7a7b4]">
        Quoted tweet deleted
      </div>
    )
  }

  const condensed = compact || summary
  const profileHref = userProfileHref(tweet.username, tweet.accountId)

  return (
    <div className="mt-2 rounded-[4px] border border-zinc-200 bg-white p-2.5 dark:border-[#303036] dark:bg-[#18181b]">
      <div className="flex items-center gap-2">
        <Link
          href={profileHref}
          aria-label={`View @${tweet.username}'s profile`}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <TweetAvatar tweet={tweet} size={condensed ? 24 : 28} />
        </Link>
        <div className="min-w-0 text-[12px] leading-tight">
          <Link
            href={profileHref}
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="font-bold">{tweet.name}</span>{' '}
            <span className="text-zinc-500 dark:text-[#a7a7b4]">
              @{tweet.username}
            </span>
          </Link>{' '}
          <span className="text-zinc-500 dark:text-[#a7a7b4]">
            · {relativeTime(tweet.createdAt)}
          </span>
        </div>
      </div>
      <Link
        href={tweetPermalinkHref(tweet.id, origin, returnTo)}
        onClick={onOpen}
        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div
          className={`${condensed && !noClamp ? 'line-clamp-3' : ''} mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-700 dark:text-[#d9d9de]`}
        >
          {decodeTweetText(tweet.text)}
        </div>
      </Link>
      {!summary && (
        <TweetImages
          media={tweet.media}
          compact={compact}
          label="Quoted tweet image"
        />
      )}
      {!condensed && (
        <div className="mt-1.5 flex gap-4 text-[11.5px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          <span>♥ {formatCount(tweet.likes)}</span>
          <span>⇄ {formatCount(tweet.rts)}</span>
        </div>
      )}
    </div>
  )
}

export interface TweetCardProps {
  tweet: PortalTweet
  animate?: boolean
  compact?: boolean
  collapsible?: boolean
  noClamp?: boolean
  featuredRank?: number
  showDate?: boolean
  showArchivedBadge?: boolean
  clickable?: boolean
  quotedTweetDisplay?: 'full' | 'summary'
  origin?: TweetOrigin
  returnTo?: string
}

function ArchivedQuotesMetric({
  count,
  href,
  onOpen,
}: {
  count: number
  href: string
  onOpen: () => void
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            onClick={onOpen}
            aria-label={`${count} archived quotes. Open tweet to see them.`}
            className="inline-flex items-center gap-1 rounded-sm text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 dark:text-[#a7a7b4] dark:hover:text-zinc-200"
          >
            <span aria-hidden="true">✦</span>
            <span>{formatCount(count)} archived quotes</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Archived quotes are distinct quote tweets from archive uploaders and
          opted-in members. Bangers uses this count for its Best ranking. Open
          the tweet to see who quoted it.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function TweetRow({
  tweet,
  animate = false,
  compact = false,
  collapsible = false,
  noClamp = false,
  featuredRank,
  showDate = false,
  showArchivedBadge = false,
  clickable = false,
  quotedTweetDisplay = 'full',
  origin,
  returnTo,
}: TweetCardProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const canExpand = collapsible && !noClamp && tweet.text.length > 280
  const href = tweetPermalinkHref(tweet.id, origin, returnTo)
  const profileHref = userProfileHref(tweet.username, tweet.accountId)
  const isFeatured = featuredRank !== undefined
  const isClickable = clickable || isFeatured
  const captureAction = (
    action:
      | 'collapse'
      | 'expand'
      | 'open'
      | 'open_archived_quotes'
      | 'open_quoted_tweet',
  ) => {
    capturePostHogEvent('tweet_card_action', {
      action,
      origin: origin ?? 'unknown',
      has_media: imageMedia(tweet.media).length > 0,
      has_quoted_tweet: Boolean(tweet.quotedTweet),
      is_featured: isFeatured,
    })
  }
  const rowClassName = isFeatured
    ? `relative flex min-w-0 gap-3 rounded-lg border border-zinc-200/75 bg-white p-4 shadow-sm dark:border-[#303036]/80 dark:bg-[#1b1b1e] sm:gap-3.5 sm:p-5 ${FEATURED_CARD_HOVER} ${
        animate ? 'portal-slide-in' : ''
      }`
    : `flex gap-3 border-b border-zinc-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23] ${
        animate ? 'portal-slide-in' : ''
      }`

  const activateCard = () => {
    captureAction('open')
    router.push(href)
  }
  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (!isClickable) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, [role="button"]')) return
    activateCard()
  }
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isClickable || event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activateCard()
  }

  const tweetContent = (
    <div
      className={`mt-0.5 leading-relaxed text-zinc-700 dark:text-[#d9d9de] ${
        compact
          ? 'text-[13.5px]'
          : isFeatured
            ? 'text-[14.5px]'
            : 'text-[14px]'
      } ${
        noClamp
          ? ''
          : compact
            ? 'line-clamp-2'
            : canExpand && !isExpanded
              ? 'line-clamp-5'
              : ''
      }`}
    >
      {decodeTweetText(tweet.text)}
    </div>
  )

  const details = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2 overflow-hidden">
        <Link
          href={profileHref}
          className="min-w-0 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span
            className={`truncate font-bold ${compact ? 'text-[13px]' : 'text-[13.5px]'}`}
          >
            {tweet.name}
          </span>{' '}
          <span className="text-[12px] text-zinc-500 dark:text-[#a7a7b4]">
            @{tweet.username}
          </span>
        </Link>
        <span className="flex-shrink-0 text-[12px] text-zinc-500 dark:text-[#a7a7b4]">
          ·{' '}
          {showDate
            ? shortDate(tweet.createdAt)
            : relativeTime(tweet.createdAt)}
        </span>
      </div>
      <Link
        href={href}
        onClick={() => captureAction('open')}
        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {tweetContent}
      </Link>
      {canExpand && (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => {
            captureAction(isExpanded ? 'collapse' : 'expand')
            setIsExpanded((expanded) => !expanded)
          }}
          className="mt-1 text-[12px] font-semibold text-brand hover:underline"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
      <TweetImages media={tweet.media} compact={compact} label="Tweet image" />
      {tweet.quotedTweet && (
        <QuotedTweet
          tweet={tweet.quotedTweet}
          compact={compact}
          summary={quotedTweetDisplay === 'summary'}
          noClamp={noClamp}
          origin={origin}
          returnTo={returnTo}
          onOpen={() => captureAction('open_quoted_tweet')}
        />
      )}
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {tweet.quoteCount !== undefined && (
            <ArchivedQuotesMetric
              count={tweet.quoteCount}
              href={href}
              onOpen={() => captureAction('open_archived_quotes')}
            />
          )}
          <span>♥ {formatCount(tweet.likes)}</span>
          <span>⇄ {formatCount(tweet.rts)}</span>
          {showArchivedBadge && <span className="text-brand">archived</span>}
        </div>
      )}
    </div>
  )

  return (
    <article
      className={`${rowClassName} ${
        isClickable
          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2'
          : ''
      }`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={isClickable ? 'link' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `View tweet by @${tweet.username}` : undefined}
    >
      <Link href={profileHref} aria-label={`View @${tweet.username}'s profile`}>
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
