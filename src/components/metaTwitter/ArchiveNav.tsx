import Link from 'next/link'

export interface NavChapter {
  year: number
  count: number
  topics: { label: string; slug: string }[]
}

/**
 * Left archive navigation: Overall, then years (newest first) with their
 * topics. Selection state comes from the URL (chapter/topic search params).
 */
export function ArchiveNav({
  basePath,
  chapters,
  activeYear,
  activeTopicSlug,
}: {
  basePath: string
  chapters: NavChapter[]
  activeYear: number | null
  activeTopicSlug: string | null
}) {
  const isOverall = activeYear === null
  return (
    <nav className="flex shrink-0 flex-row items-center gap-0.5 overflow-x-auto border-b border-border p-3 lg:sticky lg:top-0 lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
      <div className="hidden px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground lg:block">
        Chapters
      </div>
      <Link
        href={basePath}
        className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold ${
          isOverall
            ? 'bg-foreground text-background'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        Overall — Bangers
      </Link>
      {chapters.map((chapter) => {
        const yearActive = activeYear === chapter.year
        return (
          <div key={chapter.year} className="contents lg:block">
            <Link
              href={`${basePath}?chapter=${chapter.year}`}
              className={`block whitespace-nowrap px-3 pb-1 pt-3 text-sm font-extrabold ${
                yearActive && !activeTopicSlug
                  ? 'text-foreground underline decoration-2 underline-offset-4'
                  : 'text-foreground/80 hover:text-foreground'
              }`}
            >
              {chapter.year}
            </Link>
            {chapter.topics.map((topic) => {
              const topicActive = yearActive && activeTopicSlug === topic.slug
              return (
                <Link
                  key={topic.slug}
                  href={`${basePath}?chapter=${chapter.year}&topic=${topic.slug}`}
                  className={`whitespace-nowrap rounded-lg py-[5px] pl-3 pr-3 text-sm leading-snug lg:block lg:whitespace-normal lg:pl-6 ${
                    topicActive
                      ? 'bg-accent font-bold text-accent-foreground'
                      : 'font-normal text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {topic.label}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
