'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Search } from 'lucide-react'
import {
  countByKind,
  filtersFromParams,
  filtersToQuery,
  LIBRARY_DATA_URL,
  LIBRARY_KINDS,
  LIBRARY_SORTS,
  libraryShard,
  libraryShardUrl,
  selectWorks,
  yearSpan,
  type LibraryData,
  type LibraryDetail,
  type LibraryFilters,
  type LibrarySort,
  type LibraryWork,
} from '@/lib/library'
import { captureProductAction } from '@/lib/productAnalytics'

const PAGE = 60
const KIND_LABEL = Object.fromEntries(LIBRARY_KINDS.map(([k, , one]) => [k, one]))

type Shard = Record<string, LibraryDetail>

export function LibraryHome() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const [data, setData] = useState<LibraryData | null>(null)
  const [failed, setFailed] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState(filters.q)

  useEffect(() => {
    fetch(LIBRARY_DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    setLimit(PAGE)
    setOpenId(null)
  }, [filters])
  useEffect(() => setQuery(filters.q), [filters.q])

  const set = (patch: Partial<LibraryFilters>) =>
    router.push(`${pathname}${filtersToQuery({ ...filters, ...patch })}`, {
      scroll: false,
    })

  const counts = useMemo(() => countByKind(data?.works ?? []), [data])
  const works = useMemo(
    () => (data ? selectWorks(data.works, filters) : []),
    [data, filters],
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">CA Library</h1>
        <p className="mt-2 text-muted-foreground">
          What the archive keeps passing around: essays, books, films, videos
          and papers that at least {data?.minMembers ?? 3} members tweeted
          about. The number beside each work is how many members did.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <Tab on={!filters.kind} onClick={() => { captureProductAction('library', 'filter_changed'); set({ kind: '' }) }}>
          Everything
          {data && <Count>{data.works.length}</Count>}
        </Tab>
        {LIBRARY_KINDS.filter(([k]) => !data || counts.get(k)).map(([k, label]) => (
          <Tab
            key={k}
            on={filters.kind === k}
            onClick={() => {
              captureProductAction('library', 'filter_changed')
              set({ kind: filters.kind === k ? '' : k })
            }}
          >
            {label}
            {data && <Count>{counts.get(k)}</Count>}
          </Tab>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <form
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) captureProductAction('library', 'searched')
            set({ q: query.trim() })
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors and sites"
            aria-label="Search the library"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
        <select
          value={filters.sort}
          onChange={(e) => {
            captureProductAction('library', 'filter_changed')
            set({ sort: e.target.value as LibrarySort })
          }}
          aria-label="Sort"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {LIBRARY_SORTS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {data && (
          <span className="ml-auto text-sm tabular-nums text-muted-foreground">
            {works.length.toLocaleString()} works
          </span>
        )}
      </div>

      {failed && (
        <p className="py-12 text-center text-muted-foreground">
          The library is temporarily unavailable. It is rebuilt every Monday
          and no live database query runs from this page, so it will return
          with the next snapshot.
        </p>
      )}
      {!data && !failed && (
        <p className="py-12 text-center text-muted-foreground">Loading the library…</p>
      )}
      {data && works.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          Nothing matches. Clear the search or pick another shelf.
        </p>
      )}

      <ol className="divide-y divide-border border-y border-border empty:border-0">
        {works.slice(0, limit).map((w) => (
          <li key={w.id}>
            <WorkRow
              work={w}
              open={openId === w.id}
              shards={data?.shards ?? 1}
              onToggle={() => {
                if (openId !== w.id) captureProductAction('library', 'source_opened')
                setOpenId(openId === w.id ? null : w.id)
              }}
            />
          </li>
        ))}
      </ol>

      {works.length > limit && (
        <button
          type="button"
          onClick={() => {
            captureProductAction('library', 'load_more')
            setLimit((n) => n + PAGE * 2)
          }}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Show more
        </button>
      )}

      <footer className="mt-12 max-w-2xl space-y-2 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">How this is made</h2>
        {data && (
          <p>
            Rebuilt every Monday. Last built{' '}
            {new Date(data.generated * 1000).toISOString().slice(0, 10)}.
          </p>
        )}
        <p>
          Essays, papers, ideas, sites, code and music are found by link: a work
          is listed when at least three members tweeted the same page. Books
          and films are found by name, because members rarely link them. A
          title counts once members have written it out with its author or
          year and Open Library or Wikipedia confirms it. No AI model reads the
          tweets.
        </p>
        <p>
          A title that is also a franchise or an everyday phrase is
          overcounted. Retweets and deleted tweets are left out. Videos open in{' '}
          <Link href="/tube" className="underline">CA Tube</Link>. The tweets
          behind every count are in the{' '}
          <Link href="/docs" className="underline">daily export and the API</Link>.
        </p>
      </footer>
    </div>
  )
}

function WorkRow({
  work: w,
  open,
  shards,
  onToggle,
}: {
  work: LibraryWork
  open: boolean
  shards: number
  onToggle: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-3 px-1 py-3 text-left sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-4"
      >
        <span className="text-right text-xl font-semibold tabular-nums leading-tight">
          {w.n}
        </span>
        <span className="min-w-0">
          <span className="block break-words text-base font-medium leading-snug group-hover:underline sm:text-lg">
            {w.t}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">
              {KIND_LABEL[w.k]}
            </span>
            {w.s && <span className="break-words">{w.s}</span>}
            <span className="tabular-nums">
              {w.tw.toLocaleString()} tweets · {yearSpan(w)}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 self-center text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <WorkDetail work={w} shards={shards} />}
    </>
  )
}

const shardCache = new Map<number, Promise<Shard>>()

function loadShard(n: number): Promise<Shard> {
  let p = shardCache.get(n)
  if (!p) {
    p = fetch(libraryShardUrl(n)).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)),
    )
    p.catch(() => shardCache.delete(n))
    shardCache.set(n, p)
  }
  return p
}

function WorkDetail({ work: w, shards }: { work: LibraryWork; shards: number }) {
  const [detail, setDetail] = useState<LibraryDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const current = useRef(w.id)

  useEffect(() => {
    current.current = w.id
    setDetail(null)
    setFailed(false)
    loadShard(libraryShard(w.id, shards))
      .then((s) => {
        if (current.current === w.id) setDetail(s[w.id] ?? { who: [], top: [] })
      })
      .catch(() => setFailed(true))
  }, [w.id, shards])

  const internal = w.u.startsWith('/')
  const linkClass =
    'inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2'
  const more = detail ? w.n - Math.min(detail.who.length, 24) : 0

  return (
    <div className="space-y-3 pb-5 pl-1 pr-1 sm:pl-[4.75rem]">
      {w.d && <p className="text-sm text-muted-foreground">{w.d}</p>}
      {internal ? (
        <Link href={w.u} className={linkClass}>
          Watch in CA Tube
        </Link>
      ) : (
        <a
          href={w.u}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => captureProductAction('library', 'external_opened')}
          className={linkClass}
        >
          {w.by === 'name' ? 'About this work' : 'Open the original'}
          <ArrowUpRight className="h-4 w-4" />
        </a>
      )}
      {failed && (
        <p className="text-sm text-muted-foreground">
          The tweets could not be loaded. Close and reopen this work to try again.
        </p>
      )}
      {!detail && !failed && (
        <p className="text-sm text-muted-foreground">Loading tweets…</p>
      )}
      {detail && (
        <>
          <p className="break-words text-sm text-muted-foreground">
            Tweeted by{' '}
            {detail.who.slice(0, 24).map((u) => `@${u}`).join(', ')}
            {more > 0 && ` and ${more} more`}
          </p>
          <ul className="space-y-2">
            {detail.top.map((t) => (
              <li
                key={t.i}
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
              >
                <div className="mb-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">@{t.u}</span>
                  <span>{new Date(t.c * 1000).toISOString().slice(0, 10)}</span>
                  <span className="tabular-nums">{t.f.toLocaleString()} likes</span>
                  <Link href={`/tweets/${t.i}`} className="underline">
                    Open tweet
                  </Link>
                </div>
                <p className="whitespace-pre-wrap break-words">{t.x}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
        on
          ? 'bg-foreground text-background'
          : 'bg-muted text-foreground hover:bg-muted/70'
      }`}
    >
      {children}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="text-xs tabular-nums opacity-70">{children}</span>
}
