'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StrandPageData } from '@/lib/community-apps/types'
import StrandMinimap, { type MapStrand } from './StrandMinimap'
import { StrandFocusProvider } from './StrandFocus'
import { StrandCard } from './StrandCard'

export function StrandFeed({
  query,
  initialPage,
}: {
  query: string
  initialPage?: StrandPageData
}) {
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const offset = page ? page.nextOffset : 0
  const sentinel = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const controller = useRef<AbortController>()
  const load = useCallback(async () => {
    if (inFlight.current || offset === null) return
    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/strands?${new URLSearchParams({ q: query, offset: String(offset) })}`,
        { signal: abort.signal, cache: 'no-store' },
      )
      if (!response.ok)
        throw new Error('Strands could not load. Please try again.')
      const result: StrandPageData = await response.json()
      if (abort.signal.aborted) return
      setPage((previous) => ({
        ...result,
        items: [
          ...(previous?.items ?? []),
          ...result.items.filter(
            (item) => !previous?.items.some((p) => p.id === item.id),
          ),
        ],
      }))
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      if (controller.current === abort) inFlight.current = false
      if (!abort.signal.aborted) setLoading(false)
    }
  }, [query, offset])
  useEffect(
    () => () => {
      controller.current?.abort()
      inFlight.current = false
    },
    [],
  )
  useEffect(() => {
    if (!page && !error) void load()
  }, [page, error, load])
  useEffect(() => {
    if (!sentinel.current || !page || error || offset === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load()
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [load, page, error, offset])
  return (
    <>
      <p className="mb-5 text-sm text-muted-foreground" role="status">
        {page
          ? `${page.total} ${page.total === 1 ? 'strand' : 'strands'} · ${query ? 'ordered by search relevance' : 'ordered by the original analysis’s rating'}`
          : 'Searching strands…'}
      </p>
      <section aria-label="Strands" className="space-y-7" aria-busy={loading}>
        {page?.items.map((strand) => (
          <StrandCard key={strand.id} strand={strand} />
        ))}
      </section>
      <div ref={sentinel} className="py-8 text-center">
        {error && (
          <p role="alert" className="mb-3 text-sm">
            {error}
          </p>
        )}
        {offset !== null ? (
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading
              ? 'Loading strands…'
              : error
                ? 'Try again'
                : 'Load more strands'}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {page?.total
              ? 'You’ve reached the end of the strands.'
              : 'No strands match this search.'}
          </p>
        )}
      </div>
    </>
  )
}

export function StrandBrowser({
  strands,
  initialQuery,
  initialPage,
  initialCluster,
}: {
  strands: MapStrand[]
  initialQuery: string
  initialPage: StrandPageData
  initialCluster?: number
}) {
  const [input, setInput] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])
  return (
    <StrandFocusProvider>
      <div className="grid w-full items-start gap-8 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setQuery(input.trim())
            }}
            className="mb-6 flex max-w-xl gap-3"
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search strands</span>
              <input
                type="search"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={120}
                placeholder="Search ideas, topics, or people"
                className="h-11 w-full rounded-lg border border-border bg-background px-4"
              />
            </label>
            <button className="rounded-lg bg-brand px-5 font-semibold text-brand-foreground">
              Search
            </button>
          </form>
          <StrandFeed
            key={query}
            query={query}
            initialPage={query === initialQuery ? initialPage : undefined}
          />
        </div>
        <StrandMinimap strands={strands} initialCluster={initialCluster} />
      </div>
    </StrandFocusProvider>
  )
}
