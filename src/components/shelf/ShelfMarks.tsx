import { cn } from '@/utils/tailwind'
import { SHELF_MARK_GLYPH, SHELF_MARK_LABEL } from '@/lib/shelf/labels'
import type { ShelfMark } from '@/lib/shelf/types'

const TONE: Record<ShelfMark, string> = {
  loved: 'text-rose-600 dark:text-rose-400',
  recommended: 'text-brand',
  disliked: 'text-muted-foreground',
}

/** ♥ loved, ↗ recommended, ✕ didn't like. Labels are read by screen readers. */
export function ShelfMarks({
  marks,
  className,
}: {
  marks: ShelfMark[]
  className?: string
}) {
  if (!marks.length) return null
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {marks.map((mark) => (
        <span key={mark} title={SHELF_MARK_LABEL[mark]} className={TONE[mark]}>
          <span aria-hidden="true">{SHELF_MARK_GLYPH[mark]}</span>
          <span className="sr-only">{SHELF_MARK_LABEL[mark]}</span>
        </span>
      ))}
    </span>
  )
}
