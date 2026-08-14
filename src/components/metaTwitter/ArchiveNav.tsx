import Link from 'next/link'
import { formatNumber } from '@/lib/formatNumber'

export interface NavChapter {
  year: number
  count: number
}

export function ArchiveNav({
  basePath,
  chapters,
  activeYear,
}: {
  basePath: string
  chapters: NavChapter[]
  activeYear: number | null
}) {
  const isOverall = activeYear === null
  return (
    <nav
      aria-label="Bangers by year"
      className="flex shrink-0 flex-row items-center gap-0.5 overflow-x-auto border-b border-border p-3 lg:sticky lg:top-0 lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-5"
    >
      <div className="hidden px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground lg:block">
        Chapters
      </div>
      <Link
        href={basePath}
        aria-current={isOverall ? 'page' : undefined}
        className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold ${
          isOverall
            ? 'bg-foreground text-background'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        Overall — Bangers
      </Link>
      {chapters.map((chapter) => {
        const active = activeYear === chapter.year
        return (
          <Link
            key={chapter.year}
            href={`${basePath}?chapter=${chapter.year}`}
            aria-current={active ? 'page' : undefined}
            className={`flex whitespace-nowrap rounded-lg px-3 py-2 text-sm lg:mt-1 lg:justify-between ${
              active
                ? 'bg-accent font-bold text-accent-foreground'
                : 'text-foreground/80 hover:bg-muted hover:text-foreground'
            }`}
          >
            <span>{chapter.year}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {formatNumber(chapter.count)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
