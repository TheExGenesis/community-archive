'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PortalTweet } from '@/lib/portal/types'

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
  tweet: PortalTweet
  size?: number
}) {
  const initials = tweet.username.slice(0, 2).toUpperCase()
  if (tweet.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tweet.avatar}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
      style={{
        width: size,
        height: size,
        background: `hsl(${avatarHue(tweet.username)},42%,42%)`,
      }}
    >
      {initials}
    </div>
  )
}

export function TweetRow({
  tweet,
  animate = false,
  compact = false,
  collapsible = false,
  showDate = false,
  showArchivedBadge = false,
}: {
  tweet: PortalTweet
  animate?: boolean
  compact?: boolean
  collapsible?: boolean
  showDate?: boolean
  showArchivedBadge?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const canExpand = collapsible && tweet.text.length > 280
  const href = `/tweets/${tweet.id}`
  const rowClassName = `flex gap-3 border-b border-zinc-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23] ${
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
            : `text-[14px] ${canExpand && !isExpanded ? 'line-clamp-5' : ''}`
        }`}
      >
        {tweet.text}
      </div>
    </>
  )

  const details = (
    <div className="min-w-0 flex-1">
      {collapsible ? (
        <Link href={href} className="block">
          {tweetContent}
        </Link>
      ) : (
        tweetContent
      )}
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
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {tweet.quoteCount !== undefined && (
            <span className="font-semibold text-brand">
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

  if (collapsible) {
    return (
      <article className={rowClassName}>
        <Link href={href} aria-label={`View tweet by @${tweet.username}`}>
          <TweetAvatar tweet={tweet} />
        </Link>
        {details}
      </article>
    )
  }

  return (
    <Link href={href} className={rowClassName}>
      <TweetAvatar tweet={tweet} />
      {details}
      {compact && (
        <div className="whitespace-nowrap text-[11.5px] tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          ♥ {formatCount(tweet.likes)}
        </div>
      )}
    </Link>
  )
}
