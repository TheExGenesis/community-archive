import {
  Heart,
  Megaphone,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/tailwind'
import { SHELF_MARK_LABEL } from '@/lib/shelf/labels'
import type { ShelfMark } from '@/lib/shelf/types'

const MARK: Record<
  ShelfMark,
  { Icon: LucideIcon; tone: string; fill?: boolean }
> = {
  loved: { Icon: Heart, tone: 'text-rose-600 dark:text-rose-400', fill: true },
  // Only loved is coloured; liked is a mild signal and reads as neutral text.
  liked: { Icon: ThumbsUp, tone: 'text-foreground/80' },
  // A megaphone: they told others about it. (An arrow read as an external link.)
  recommended: { Icon: Megaphone, tone: 'text-brand' },
  disliked: { Icon: ThumbsDown, tone: 'text-muted-foreground' },
  hated: { Icon: ThumbsDown, tone: 'text-muted-foreground', fill: true },
}

/** Loved, liked, recommended, didn't like, hated. Labels are read by screen readers. */
export function ShelfMarks({
  marks,
  size = 14,
  tone = true,
  className,
}: {
  marks: ShelfMark[]
  size?: number
  /** False keeps the surrounding text colour (marks on a cover image). */
  tone?: boolean
  className?: string
}) {
  if (!marks.length) return null
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {marks.map((mark) => {
        const { Icon, tone: color, fill } = MARK[mark]
        return (
          <span
            key={mark}
            title={SHELF_MARK_LABEL[mark]}
            className={cn('inline-flex', tone && color)}
          >
            <Icon
              aria-hidden="true"
              width={size}
              height={size}
              strokeWidth={2.25}
              className={fill ? 'fill-current' : undefined}
            />
            <span className="sr-only">{SHELF_MARK_LABEL[mark]}</span>
          </span>
        )
      })}
    </span>
  )
}

/** How many of the member's tweets mention the work: a speech bubble and the number. */
export function ShelfTweetCount({
  count,
  size = 13,
}: {
  count: number
  size?: number
}) {
  if (count < 2) return null
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums"
      title={`${count} tweets`}
    >
      <MessageCircle
        aria-hidden="true"
        width={size}
        height={size}
        strokeWidth={2.25}
      />
      {count}
      <span className="sr-only"> tweets</span>
    </span>
  )
}
