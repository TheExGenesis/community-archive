'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PiArrowSquareOut, PiX } from 'react-icons/pi'
import { TweetAvatar } from '@/components/TweetAvatar'
import TweetCard from '@/components/TweetCard'
import { KindIcon, KindTag } from '@/components/bulletin/KindTag'
import type { DigestBulletinItem } from '@/lib/digest/bulletin'
import {
  tweetPermalinkHref,
  userProfileHref,
  type TweetOrigin,
} from '@/lib/navigation'
import styles from '@/components/bulletin/BulletinBoard.module.css'

type CardPlacement = { origin: TweetOrigin; returnTo: string }

function DigestBulletinCard({
  item,
  preview,
  origin,
  returnTo,
}: {
  item: DigestBulletinItem
  preview: boolean
} & CardPlacement) {
  const [open, setOpen] = useState(false)
  const { tweet } = item
  const originalId = `digest-bulletin-${tweet.id}`
  const tweetUrl = `https://x.com/${encodeURIComponent(tweet.username)}/status/${encodeURIComponent(tweet.id)}`
  const sticker = (
    <span
      className={`${styles.kind} ${item.side === 'offer' ? styles.offer : styles.ask}`}
    >
      <KindIcon kind={item.kind} size={13} />
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
                origin={origin}
                returnTo={returnTo}
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
                <Link href={tweetPermalinkHref(tweet.id, origin, returnTo)}>
                  See on CA
                </Link>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
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
            <span className={styles.facts}>
              <KindTag kind={item.kind} label={item.label} />
              <time dateTime={tweet.createdAt} className={styles.age}>
                {new Date(tweet.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </time>
            </span>
          </div>
        </>
      )}
    </article>
  )
}

export function DigestBulletinCards({
  items,
  preview = false,
  origin = 'digest',
  returnTo = '/digest',
  className,
}: {
  items: DigestBulletinItem[]
  preview?: boolean
  className?: string
} & Partial<CardPlacement>) {
  return (
    <div className={`${styles.digestCards} ${className ?? ''}`}>
      {items.map((item) => (
        <DigestBulletinCard
          key={item.tweet.id}
          item={item}
          preview={preview}
          origin={origin}
          returnTo={returnTo}
        />
      ))}
    </div>
  )
}
