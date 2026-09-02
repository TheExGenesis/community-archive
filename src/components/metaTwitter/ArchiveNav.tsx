'use client'

import Link from 'next/link'
import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { formatNumber } from '@/lib/formatNumber'
import type { ChapterSection } from '@/lib/metaTwitter/chapterSections'

export interface NavChapter {
  year: number
  count: number
}

export const archiveChapterHref = (
  basePath: string,
  year: number | null,
  sectionSlug: string | null = null,
) => {
  const [pathname, query = ''] = basePath.split('?', 2)
  const params = new URLSearchParams(query)
  if (year === null) params.delete('chapter')
  else params.set('chapter', String(year))
  if (year === null || sectionSlug === null) params.delete('section')
  else params.set('section', sectionSlug)
  const serialized = params.toString()
  return serialized ? `${pathname}?${serialized}` : pathname
}

export function ArchiveNav({
  basePath,
  chapters,
  activeYear,
  sectionsByYear = {},
  activeSectionSlug = null,
  onSelect,
  onSelectSection,
  footer,
}: {
  basePath: string
  chapters: NavChapter[]
  activeYear: number | null
  /** Curated sections per chapter year; every chapter lists its own. */
  sectionsByYear?: Record<number, ChapterSection[]>
  activeSectionSlug?: string | null
  onSelect?: (year: number | null) => void
  onSelectSection?: (year: number, slug: string | null) => void
  /** Rendered after the chapter list; wide layout only. */
  footer?: ReactNode
}) {
  const intercepts = (event: MouseEvent<HTMLAnchorElement>) =>
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  const select = (
    event: MouseEvent<HTMLAnchorElement>,
    year: number | null,
  ) => {
    if (!onSelect || !intercepts(event)) return
    event.preventDefault()
    onSelect(year)
  }
  const selectSection = (
    event: MouseEvent<HTMLAnchorElement>,
    year: number,
    slug: string | null,
  ) => {
    if (!onSelectSection || !intercepts(event)) return
    event.preventDefault()
    onSelectSection(year, slug)
  }
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
        href={archiveChapterHref(basePath, null)}
        prefetch={false}
        onClick={(event) => select(event, null)}
        aria-current={isOverall ? 'page' : undefined}
        className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold ${
          isOverall
            ? 'bg-foreground text-background'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        All time
      </Link>
      {chapters.map((chapter) => {
        const active = activeYear === chapter.year
        const sections = sectionsByYear[chapter.year] ?? []
        return (
          <Fragment key={chapter.year}>
            {/* The compact nav hides sections, so the year is always its
                control there; the wide nav keeps the year clickable only for
                chapters with no sections of their own. */}
            <Link
              href={archiveChapterHref(basePath, chapter.year)}
              prefetch={false}
              onClick={(event) => select(event, chapter.year)}
              aria-current={active ? 'page' : undefined}
              className={`flex whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                sections.length ? 'lg:hidden' : 'lg:mt-1 lg:justify-between'
              } ${
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
            {sections.length > 0 && (
              <div className="hidden whitespace-nowrap px-3 py-2 text-sm text-foreground/80 lg:mt-1 lg:flex lg:justify-between">
                <span>{chapter.year}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatNumber(chapter.count)}
                </span>
              </div>
            )}
            {sections.map((section) => {
              const sectionActive = active && activeSectionSlug === section.slug
              return (
                <Link
                  key={section.slug}
                  href={archiveChapterHref(
                    basePath,
                    chapter.year,
                    section.slug,
                  )}
                  prefetch={false}
                  onClick={(event) =>
                    selectSection(
                      event,
                      chapter.year,
                      sectionActive ? null : section.slug,
                    )
                  }
                  aria-current={sectionActive ? 'page' : undefined}
                  // Titles like "other" repeat across chapters.
                  aria-label={`${section.title}, ${chapter.year}`}
                  className={`hidden rounded-lg px-3 py-1.5 text-[13px] leading-snug lg:mt-0.5 lg:line-clamp-2 lg:block ${
                    sectionActive
                      ? 'bg-muted font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {section.title}
                </Link>
              )
            })}
          </Fragment>
        )
      })}
      {footer ? <div className="hidden lg:block">{footer}</div> : null}
    </nav>
  )
}
