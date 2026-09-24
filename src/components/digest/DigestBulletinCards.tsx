'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  PiArrowSquareOut,
  PiBriefcase,
  PiCalendarBlank,
  PiChatsCircle,
  PiGift,
  PiHandHeart,
  PiUsersThree,
  PiX,
} from 'react-icons/pi'
import type { IconType } from 'react-icons'
import { TweetAvatar } from '@/components/TweetAvatar'
import TweetCard from '@/components/TweetCard'
import { KIND_ICONS } from '@/lib/bulletin/types'
import type { DigestBulletinItem } from '@/lib/digest/bulletin'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'
import styles from '@/components/bulletin/BulletinBoard.module.css'

const ICONS: Record<string, IconType> = {
  gift: PiGift,
  briefcase: PiBriefcase,
  calendar: PiCalendarBlank,
  users: PiUsersThree,
  'hand-heart': PiHandHeart,
  chats: PiChatsCircle,
}

function DigestBulletinCard({
  item,
  preview,
}: {
  item: DigestBulletinItem
  preview: boolean
}) {
  const [open, setOpen] = useState(false)
  const { tweet } = item
  const Icon = ICONS[KIND_ICONS[item.kind]]
  const originalId = `digest-bulletin-${tweet.id}`
  const tweetUrl = `https://x.com/${encodeURIComponent(tweet.username)}/status/${encodeURIComponent(tweet.id)}`
  const sticker = (
    <span
      className={`${styles.kind} ${item.side === 'offer' ? styles.offer : styles.ask}`}
    >
      {Icon ? <Icon size={13} aria-hidden /> : null}
      {item.label}
    </span>
  )

  return (
    <article
      className={`${styles.notice} ${open ? styles.open : ''}`}
      onClick={(event) => {
        if (open || (event.target as HTMLElement).closest('a, button')) return
        setOpen(true)
      }}
    >
      {open ? (
        <>
          <div className={styles.stickerRow}>
            {sticker}
            <button
              type="button"
              className={styles.collapse}
              aria-label={`Collapse ${preview ? 'example' : 'tweet'} by @${tweet.username}`}
              aria-expanded={true}
              aria-controls={originalId}
              onClick={() => setOpen(false)}
            >
              <PiX size={12} aria-hidden /> collapse
            </button>
          </div>
          <div
            id={originalId}
            className={preview ? styles.fullText : styles.expanded}
          >
            {preview ? (
              tweet.text
            ) : (
              <TweetCard
                tweet={tweet}
                clickable={false}
                showDate
                stacked
                origin="digest"
                returnTo="/digest"
              />
            )}
          </div>
          {!preview ? (
            <div className={styles.foot}>
              <p className={styles.acts}>
                <a
                  className={styles.primary}
                  href={tweetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on X <PiArrowSquareOut size={12} aria-hidden />
                </a>
                <Link href={tweetPermalinkHref(tweet.id, 'digest', '/digest')}>
                  See on CA
                </Link>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className={styles.stickerRow}>
            {sticker}
            <span className={styles.readHint} aria-hidden>
              click to read more
            </span>
          </div>
          <span className={styles.corner}>
            <time dateTime={tweet.createdAt} className={styles.age}>
              {new Date(tweet.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </time>
          </span>
          <button
            type="button"
            className={styles.summaryButton}
            aria-label={`Read full ${preview ? 'example' : 'tweet'} by @${tweet.username}`}
            title={item.summary}
            aria-expanded={false}
            aria-controls={originalId}
            onClick={() => setOpen(true)}
          >
            <span className={styles.summary}>{item.summary}</span>
          </button>
          <div className={styles.who}>
            {preview ? (
              <span className={styles.author}>
                <TweetAvatar tweet={tweet} size={18} />
                <span>{tweet.name}</span>
              </span>
            ) : (
              <Link
                href={userProfileHref(tweet.username, tweet.accountId)}
                className={styles.author}
              >
                <TweetAvatar tweet={tweet} size={18} />
                <span>{tweet.name || `@${tweet.username}`}</span>
              </Link>
            )}
          </div>
        </>
      )}
    </article>
  )
}

export function DigestBulletinCards({
  items,
  preview = false,
}: {
  items: DigestBulletinItem[]
  preview?: boolean
}) {
  return (
    <div className={styles.digestCards}>
      {items.map((item) => (
        <DigestBulletinCard key={item.tweet.id} item={item} preview={preview} />
      ))}
    </div>
  )
}
