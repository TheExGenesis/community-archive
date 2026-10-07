'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Newspaper, Waypoints } from 'lucide-react'
import type {
  RelatedDigestStory,
  RelatedResults,
  RelatedStrand,
} from '@/lib/search/relatedContentMatch'

const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const formatDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? isoDate : dateFormat.format(date)
}

function useRelated<T>(type: 'strands' | 'digest', query: string | null) {
  const [results, setResults] = useState<RelatedResults<T> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResults(null)
    if (!query) return () => controller.abort()

    const params = new URLSearchParams({ q: query, type })
    void fetch(`/api/search/related?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: RelatedResults<T> | null) => {
        if (!controller.signal.aborted && Array.isArray(data?.items))
          setResults(data)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [type, query])

  return results
}

function RelatedSection({
  id,
  icon,
  heading,
  action,
  children,
}: {
  id: string
  icon: ReactNode
  heading: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 id={id} className="text-sm font-semibold text-foreground">
            {heading}
          </h2>
        </div>
        {action}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">{children}</div>
    </section>
  )
}

const cardClass =
  'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-accent'

export default function RelatedContentResults({ query }: { query?: string }) {
  const term = query?.trim() && query.trim().length >= 2 ? query.trim() : null
  const strands = useRelated<RelatedStrand>('strands', term)
  const stories = useRelated<RelatedDigestStory>('digest', term)

  return (
    <>
      {strands && strands.items.length > 0 && (
        <RelatedSection
          id="strand-results-heading"
          icon={<Waypoints className="h-4 w-4 text-brand" aria-hidden="true" />}
          heading="Strands"
          action={
            strands.total > strands.items.length && (
              <Link
                href={`/strands?q=${encodeURIComponent(term ?? '')}`}
                className="shrink-0 text-xs font-medium text-brand hover:underline"
              >
                See all {strands.total} strands
              </Link>
            )
          }
        >
          {strands.items.map((strand) => (
            <Link
              key={strand.id}
              href={`/strands/${strand.id}`}
              className={cardClass}
            >
              <span className="truncate text-xs text-muted-foreground">
                @{strand.username}
              </span>
              <span className="line-clamp-2 text-sm font-semibold text-foreground">
                {strand.title}
              </span>
              <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {strand.summary}
              </span>
            </Link>
          ))}
        </RelatedSection>
      )}
      {stories && stories.items.length > 0 && (
        <RelatedSection
          id="digest-results-heading"
          icon={<Newspaper className="h-4 w-4 text-brand" aria-hidden="true" />}
          heading="Digest stories"
        >
          {stories.items.map((story) => (
            <Link
              key={`${story.digestDate}/${story.slug}`}
              href={`/digest/${story.digestDate}/${encodeURIComponent(story.slug)}`}
              className={cardClass}
            >
              <span className="truncate text-xs text-muted-foreground">
                {formatDate(story.publishedDate)}
              </span>
              <span className="line-clamp-2 text-sm font-semibold text-foreground">
                {story.title}
              </span>
              <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {story.subtitle}
              </span>
            </Link>
          ))}
        </RelatedSection>
      )}
    </>
  )
}
