import {
  PiBriefcase,
  PiCalendarBlank,
  PiChatsCircle,
  PiGift,
  PiHandHeart,
  PiUsersThree,
} from 'react-icons/pi'
import type { IconType } from 'react-icons'
import { KIND_ICONS } from '@/lib/bulletin/types'
import styles from './BulletinBoard.module.css'

const ICONS: Record<string, IconType> = {
  gift: PiGift,
  briefcase: PiBriefcase,
  calendar: PiCalendarBlank,
  users: PiUsersThree,
  'hand-heart': PiHandHeart,
  chats: PiChatsCircle,
}

export function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const Icon = ICONS[KIND_ICONS[kind]]
  return Icon ? <Icon size={size} aria-hidden /> : null
}

/**
 * The card's kind as an icon alone; hovering or focusing it shows the label.
 * With `onClick` it is a button (the board uses it to filter by kind).
 */
export function KindTag({
  kind,
  label,
  tip = label,
  actionLabel,
  onClick,
}: {
  kind: string
  label: string
  tip?: string
  /** Accessible name of the button, describing what a click does. */
  actionLabel?: string
  onClick?: () => void
}) {
  return onClick ? (
    <button
      type="button"
      className={styles.kindTag}
      data-tip={tip}
      aria-label={actionLabel ?? tip}
      onClick={onClick}
    >
      <KindIcon kind={kind} size={13} />
    </button>
  ) : (
    <span
      className={styles.kindTag}
      data-tip={tip}
      role="img"
      aria-label={label}
      tabIndex={0}
    >
      <KindIcon kind={kind} size={13} />
    </span>
  )
}
