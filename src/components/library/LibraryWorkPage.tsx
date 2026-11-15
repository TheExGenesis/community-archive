'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import {
  LIBRARY_DATA_URL,
  yearSpan,
  type LibraryData,
  type LibraryTweet,
} from '@/lib/library'
import { captureProductAction } from '@/lib/productAnalytics'
import {
  Cover,
  KIND_LABEL,
  LibraryTweets,
  MemberAvatars,
  useLibraryDetail,
} from './shared'

type TweetSort = 'liked' | 'newest' | 'oldest'
const TWEET_SORTS: [TweetSort, string][] = [
  ['liked', 'Most liked'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
]

/** One work and every tweet the library stores about it. */
export function LibraryWorkPage({ id }: { id: string }) {
  const [data, setData] = useState<LibraryData | null>(null)
  const [failed, setFailed] = useState(false)
  const [sort, setSort] = useState<TweetSort>('liked')

  useEffect(() => {
    fetch(LIBRARY_DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const work = data?.works.find((w) => w.id === id) ?? null
  const detail = useLibraryDetail(work ? id : null, data?.shards ?? 1)

  const tweets = useMemo(() => {
    if (!detail || detail === 'failed') return []
    const all: LibraryTweet[] = [...detail.top, ...(detail.more ?? [])]
    const order = {
      liked: (a: LibraryTweet, b: LibraryTweet) => b.f - a.f,
      newest: (a: LibraryTweet, b: LibraryTweet) => b.c - a.c,
      oldest: (a: LibraryTweet, b: LibraryTweet) => a.c - b.c,
    }[sort]
    return all.sort(order)
  }, [detail, sort])

  const back = (
    <Link
      href="/library"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      CA Library
    </Link>
  )

  if (failed || (data && !work)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        {back}
        <p className="py-12 text-center text-muted-foreground">
          {failed
            ? 'The library is temporarily unavailable. Please try again shortly.'
            : 'This work is not in the current library. The list is rebuilt daily, so it may have dropped below three members.'}
        </p>
      </div>
    )
  }
  if (!work) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        {back}
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      </div>
    )
  }

  const internal = work.u.startsWith('/')
  const stored = tweets.length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
      {back}
      <header className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end">
        <Cover work={work} large />
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {KIND_LABEL[work.k]}
            {work.s && <span className="normal-case tracking-normal"> · {work.s}</span>}
          </p>
          <h1 className="break-words text-3xl font-semibold tracking-tight [text-wrap:balance]">
            {work.t}
          </h1>
          {work.d && <p className="text-sm text-muted-foreground">{work.d}</p>}
          <p className="text-sm tabular-nums text-muted-foreground">
            {work.n.toLocaleString()} members · {work.tw.toLocaleString()} tweets ·{' '}
            {yearSpan(work)}
          </p>
          {internal ? (
            <Link
              href={work.u}
              className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
            >
              Watch in CA Tube
            </Link>
          ) : (
            <a
              href={work.u}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => captureProductAction('library', 'external_opened')}
              className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
            >
              {work.by === 'name' ? 'About this work' : 'Open the original'}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      {detail === 'failed' && (
        <p className="py-8 text-sm text-muted-foreground">
          The tweets could not be loaded. Reload the page to try again.
        </p>
      )}
      {detail === null && (
        <p className="py-8 text-sm text-muted-foreground">Loading tweets…</p>
      )}
      {detail && detail !== 'failed' && (
        <section className="mt-8 space-y-4">
          <MemberAvatars detail={detail} members={work.n} max={40} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm text-muted-foreground">
              {stored < work.tw
                ? `${stored.toLocaleString()} of ${work.tw.toLocaleString()} tweets`
                : `${work.tw.toLocaleString()} tweets`}
            </h2>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as TweetSort)}
              aria-label="Sort tweets"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {TWEET_SORTS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <LibraryTweets tweets={tweets} />
          {stored < work.tw && (
            <p className="text-xs text-muted-foreground">
              The library keeps up to 100 tweets per work. Every tweet is in the{' '}
              <Link href="/docs" className="underline">
                daily export and the API
              </Link>
              .
            </p>
          )}
        </section>
      )}
    </div>
  )
}
